import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { type SportsLabConfig } from "./sportsLabConfig";
import { LAB_HEADERS, denyUpgrade, labBody, labCookie, labFailure, labPath, labSocketServer, proxyLabHttp, proxyLabSocket } from "./sportsLabTransport";

export const LAB_RELAY_COOKIE = "__Host-edge-sports-lab";
export const LAB_LAUNCH_PATH = "/api/admin/sports-lab/launch";
type Session = { expiresAt: number };
type Grant = Session & { sessionHash: string };
export type ValidateLabSession = (hash: string) => Promise<Session | null>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const launchScript = `const code=new URLSearchParams(location.hash.slice(1)).get('code');history.replaceState(null,'',location.pathname);if(code){fetch('/__edgegames/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})}).then(r=>{if(!r.ok)throw Error();location.replace('/')}).catch(()=>document.getElementById('status').textContent='Launch expired or access ended. Return to administration and try again.')}else{document.getElementById('status').textContent='Launch Sports Lab from Edge Games administration.'}`;

export function createSportsLabGateway(config: SportsLabConfig, validate: ValidateLabSession, adminCookie: string, options: { recheckMs?: number; now?: () => number } = {}) {
  const now = options.now || Date.now;
  const codes = new Map<string, Grant>();
  const relays = new Map<string, Grant>();
  const active = new Set<{ stop: () => void; authorized: () => Promise<boolean> }>();
  const sockets = labSocketServer();
  let requests = 0;
  const target = { origin: config.bridgeOrigin };
  const labHost = (req: IncomingMessage) => req.headers.host === config.labOrigin.host;
  const clean = () => { for (const map of [codes, relays]) for (const [key, grant] of map) if (grant.expiresAt <= now()) map.delete(key); };
  async function valid(grant: Grant | undefined) {
    if (!grant || grant.expiresAt <= now()) return false;
    const session = await validate(grant.sessionHash).catch(() => null);
    return !!session && session.expiresAt > now();
  }
  const grantFor = (req: IncomingMessage) => {
    const value = labCookie(req.headers.cookie, LAB_RELAY_COOKIE);
    return value && /^[a-f0-9]{64}$/.test(value) ? relays.get(hash(value)) : undefined;
  };
  const json = (res: ServerResponse, data: unknown) => { res.writeHead(200, { ...LAB_HEADERS, "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };

  async function serve(req: IncomingMessage, res: ServerResponse) {
    clean();
    const path = labPath(req.url);
    if (!path) { labFailure(res, 400, "Invalid path."); return; }
    if (!labHost(req)) {
      if (req.headers.host !== config.adminOrigin.host || path !== LAB_LAUNCH_PATH) { labFailure(res, 404, "Not found."); return; }
      if (req.method !== "POST" || req.headers.origin !== config.adminOrigin.origin || req.headers["content-type"] !== "application/json") { labFailure(res, 403, "Invalid launch request."); return; }
      const token = labCookie(req.headers.cookie, adminCookie);
      if (!token || !/^[a-f0-9]{64}$/.test(token)) { labFailure(res, 401, "Sign in to administration."); return; }
      const sessionHash = hash(token);
      const session = await validate(sessionHash).catch(() => null);
      if (!session || session.expiresAt <= now()) { labFailure(res, 401, "Sign in to administration."); return; }
      await labBody(req, 1024);
      for (const [key, grant] of codes) if (grant.sessionHash === sessionHash) codes.delete(key);
      if (codes.size >= 200) { labFailure(res, 503, "Try again shortly."); return; }
      const code = randomBytes(32).toString("hex");
      codes.set(hash(code), { sessionHash, expiresAt: Math.min(session.expiresAt, now() + 30000) });
      json(res, { redirect: `${config.labOrigin.origin}/__edgegames/launch#code=${code}` }); return;
    }
    if (path === "/__edgegames/launch" && req.method === "GET") {
      res.writeHead(200, { ...LAB_HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
      res.end('<!doctype html><html lang="en"><head><title>Open Sports Lab</title></head><body><h1>Sports Lab</h1><p id="status">Checking administrator access…</p><script src="/__edgegames/launch.js" defer></script></body></html>'); return;
    }
    if (path === "/__edgegames/launch.js" && req.method === "GET") {
      res.writeHead(200, { ...LAB_HEADERS, "Content-Type": "application/javascript" }); res.end(launchScript); return;
    }
    if (path === "/__edgegames/redeem") {
      if (req.method !== "POST" || req.headers.origin !== config.labOrigin.origin || req.headers["content-type"] !== "application/json") { labFailure(res, 403, "Invalid redemption request."); return; }
      const { code } = JSON.parse((await labBody(req, 1024)).toString()) as { code?: unknown };
      if (typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code)) { labFailure(res, 401, "Invalid launch."); return; }
      const key = hash(code), grant = codes.get(key);
      codes.delete(key); // Consume before awaiting: concurrent redemption cannot replay it.
      if (!(await valid(grant)) || !grant) { labFailure(res, 401, "Launch expired or session ended."); return; }
      const session = await validate(grant.sessionHash).catch(() => null);
      if (!session || session.expiresAt <= now() || relays.size >= 200) { labFailure(res, 401, "Session unavailable."); return; }
      // Keep at most four browser sessions per administrator session.
      const previous = [...relays.entries()].filter(([, v]) => v.sessionHash === grant.sessionHash);
      for (const [key] of previous.slice(0, Math.max(0, previous.length - 3))) relays.delete(key);
      const token = randomBytes(32).toString("hex");
      relays.set(hash(token), { sessionHash: grant.sessionHash, expiresAt: session.expiresAt });
      res.setHeader("Set-Cookie", `${LAB_RELAY_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((session.expiresAt - now()) / 1000))}`);
      json(res, { ok: true }); return;
    }
    const relayToken = labCookie(req.headers.cookie, LAB_RELAY_COOKIE);
    const authorized = async () => valid(relayToken ? relays.get(hash(relayToken)) : undefined);
    if (!(await authorized())) { labFailure(res, 401, "Open Sports Lab from Edge Games administration."); return; }
    if (req.headers.origin && req.headers.origin !== config.labOrigin.origin || !["GET", "HEAD"].includes(req.method || "") && req.headers.origin !== config.labOrigin.origin) { labFailure(res, 403, "Origin rejected."); return; }
    const expiry = grantFor(req)?.expiresAt || now();
    const expiryTimer = setTimeout(() => res.destroy(), Math.max(0, Math.min(expiry - now(), 2147483647)));
    try { await proxyLabHttp(req, res, target, authorized, options.recheckMs); }
    finally { clearTimeout(expiryTimer); }
  }
  function handles(req: IncomingMessage) { return labHost(req) || req.url?.split("?", 1)[0] === LAB_LAUNCH_PATH; }
  function handle(req: IncomingMessage, res: ServerResponse) {
    if (requests >= 16) { labFailure(res, 503, "Try again shortly."); return; }
    requests++;
    req.setTimeout(15000, () => req.destroy());
    void serve(req, res).catch(() => labFailure(res, 400, "Invalid or interrupted request.")).finally(() => requests--);
  }
  async function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    socket.on("error", () => socket.destroy());
    const path = labPath(req.url);
    if (!labHost(req) || path?.split("?", 1)[0] !== "/_stcore/stream" || req.headers.origin !== config.labOrigin.origin || active.size >= 16) { denyUpgrade(socket, 403); return; }
    const grant = grantFor(req), token = labCookie(req.headers.cookie, LAB_RELAY_COOKIE);
    const authorized = async () => !!token && relays.get(hash(token)) === grant && await valid(grant);
    if (!(await authorized())) { denyUpgrade(socket); return; }
    if (active.size >= 16) { denyUpgrade(socket, 503); return; }
    if (socket.destroyed) return;
    sockets.handleUpgrade(req, socket, head, client => {
      const stopProxy = proxyLabSocket(client, req, target, authorized, options.recheckMs);
      const expiryTimer = setTimeout(stopProxy, Math.max(0, Math.min((grant?.expiresAt || now()) - now(), 2147483647)));
      const stop = () => { clearTimeout(expiryTimer); stopProxy(); };
      const entry = { stop, authorized }; active.add(entry);
      client.once("close", () => { clearTimeout(expiryTimer); active.delete(entry); });
    });
  }
  return {
    handles, handle, labHost,
    upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => { void upgrade(req, socket, head).catch(() => denyUpgrade(socket, 503)); },
    recheck: () => { for (const entry of active) void entry.authorized().then(ok => { if (!ok) entry.stop(); }).catch(entry.stop); },
    close: () => { for (const entry of active) entry.stop(); sockets.close(); codes.clear(); relays.clear(); },
  };
}
