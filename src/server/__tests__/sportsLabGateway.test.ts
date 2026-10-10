import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import { sportsLabTestCertificates } from "../../../scripts/lib/sports-lab-test-certificates";
import { createSportsLabBridge } from "../sportsLabBridge";
import { createSportsLabGateway, LAB_LAUNCH_PATH, LAB_RELAY_COOKIE } from "../sportsLabGateway";
import { labPath } from "../sportsLabTransport";
import { sportsLabConfig } from "../sportsLabConfig";

const token = "a".repeat(64);
const sessionHash = createHash("sha256").update(token).digest("hex");
let certs: ReturnType<typeof sportsLabTestCertificates>;
let bridge: ReturnType<typeof createSportsLabBridge>;
let gateway: ReturnType<typeof createSportsLabGateway>;
let lab: http.Server, front: https.Server, labSockets: WebSocketServer;
let admin: URL, site: URL, bridgeOrigin: URL, labOrigin: URL;
let activeSession = true, expiresAt = 0, clock = 0;
const seen: { url?: string; headers: IncomingMessage["headers"] }[] = [];
const wsSeen: string[] = [];
const request = (origin: URL, path: string, options: { method?: string; cookie?: string; origin?: string; body?: string; headers?: Record<string, string>; localAddress?: string } = {}) => new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
  const req = (origin.protocol === "https:" ? https : http).request({ hostname: origin.hostname, port: origin.port, path, method: options.method || "GET", ca: certs.ca, localAddress: options.localAddress, headers: {
    ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.origin ? { origin: options.origin } : {}),
    ...(options.body !== undefined ? { "content-type": "application/json", "content-length": Buffer.byteLength(options.body) } : {}), ...options.headers,
  } }, res => { const chunks: Buffer[] = []; res.on("data", value => chunks.push(value)); res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() })); });
  req.on("error", reject); req.end(options.body);
});
async function launch() {
  const result = await request(admin, LAB_LAUNCH_PATH, { method: "POST", cookie: `edge-admin=${token}`, origin: admin.origin, body: "{}" });
  expect(result.status).toBe(200);
  return new URLSearchParams(new URL(JSON.parse(result.body).redirect).hash.slice(1)).get("code")!;
}
const redeem = (code: string) => request(site, "/__edgegames/redeem", { method: "POST", origin: site.origin, body: JSON.stringify({ code }) });
async function session() {
  const response = await redeem(await launch());
  expect(response.status).toBe(200);
  return response.headers["set-cookie"]![0].split(";", 1)[0];
}
async function connected(cookie: string) {
  const socket = new WebSocket(`wss://${site.host}/_stcore/stream`, ["streamlit", "valid-xsrf"], { ca: certs.ca, origin: site.origin, headers: { cookie: cookie + "; _streamlit_xsrf=valid-xsrf; edge-member=secret" } });
  await once(socket, "open"); return socket;
}
beforeAll(async () => {
  certs = sportsLabTestCertificates();
  lab = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    if (req.url === "/redirect") { res.writeHead(302, { location: "http://attacker.invalid/private" }); res.end(); return; }
    if (req.method === "PUT" && req.headers["x-xsrftoken"] !== "valid-xsrf") { res.writeHead(403); res.end("XSRF required"); return; }
    res.setHeader("Set-Cookie", ["_streamlit_xsrf=valid-xsrf; Path=/; Domain=bad.invalid", "private-upstream=never-forward"]);
    res.end("synthetic lab");
  });
  labSockets = new WebSocketServer({ noServer: true, handleProtocols: p => p.has("streamlit") ? "streamlit" : false });
  lab.on("upgrade", (req, socket, head) => {
    if (req.headers.origin !== labOrigin.origin || !req.headers.cookie?.includes("_streamlit_xsrf=valid-xsrf") || !req.headers["sec-websocket-protocol"]?.includes("valid-xsrf")) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
    seen.push({ url: req.url, headers: req.headers });
    labSockets.handleUpgrade(req, socket, head, ws => { ws.send("ready"); ws.on("message", (value, binary) => { wsSeen.push(value.toString()); ws.send(value, { binary }); }); });
  });
  lab.listen(0, "127.0.0.1"); await once(lab, "listening");
  labOrigin = new URL(`http://127.0.0.1:${(lab.address() as AddressInfo).port}`);
  bridgeOrigin = new URL("http://127.0.0.1:1");
  bridge = createSportsLabBridge({ trustedAddress: "127.0.0.1", bridgeOrigin, labOrigin });
  bridge.server.listen(0, "127.0.0.1"); await once(bridge.server, "listening"); bridgeOrigin.port = String((bridge.server.address() as AddressInfo).port);
  front = https.createServer(certs.server, (req, res) => {
    if (gateway.handles(req)) gateway.handle(req, res);
    else { res.writeHead(404); res.end("not a lab route"); }
  });
  front.on("upgrade", (req, socket, head) => gateway.upgrade(req, socket, head));
  front.listen(0, "127.0.0.1"); await once(front, "listening");
  const port = (front.address() as AddressInfo).port;
  admin = new URL(`https://localhost:${port}`); site = new URL(`https://127.0.0.1:${port}`);
  gateway = createSportsLabGateway({ adminOrigin: admin, labOrigin: site, bridgeOrigin },
    async hash => activeSession && hash === sessionHash ? { expiresAt } : null, "edge-admin", { recheckMs: 40, now: () => clock });
}, 15000);
beforeEach(() => { activeSession = true; clock = Date.now(); expiresAt = clock + 120000; seen.length = 0; wsSeen.length = 0; });
afterAll(async () => {
  gateway?.close(); bridge?.close();
  for (const socket of labSockets?.clients || []) socket.terminate();
  labSockets?.close(); front?.closeAllConnections(); lab?.closeAllConnections();
  await Promise.all([new Promise<void>(r => front?.close(() => r())), new Promise<void>(r => lab?.close(() => r()))]);
  certs?.cleanup();
});

describe("HTTPS administrator gateway with restricted LAN transport and WebSockets", () => {
  it("denies all anonymous/player/member documents, downloads, assets and API paths before upstream", async () => {
    for (const cookie of [undefined, `edge-member=${token}`, `authjs.session-token=${token}`]) {
      for (const path of ["/", "/static/main.js", "/media/private.csv", "/_stcore/health", "/socket.io/?EIO=4&transport=polling"]) expect((await request(site, path, { cookie })).status).toBe(401);
    }
    expect(seen).toHaveLength(0);
  });
  it("rejects unauthenticated, stale, wrong-origin and duplicate-cookie launches", async () => {
    const base = { method: "POST", origin: admin.origin, body: "{}" };
    expect((await request(admin, LAB_LAUNCH_PATH, base)).status).toBe(401);
    expect((await request(admin, LAB_LAUNCH_PATH, { ...base, cookie: `edge-admin=${token}; edge-admin=${token}` })).status).toBe(401);
    expect((await request(admin, LAB_LAUNCH_PATH, { ...base, origin: "https://evil.invalid", cookie: `edge-admin=${token}` })).status).toBe(403);
    activeSession = false;
    expect((await request(admin, LAB_LAUNCH_PATH, { ...base, cookie: `edge-admin=${token}` })).status).toBe(401);
  });
  it("consumes launch codes once, including concurrent redemption; keeps cookies host-only", async () => {
    const code = await launch();
    const results = await Promise.all([redeem(code), redeem(code)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    const cookie = results.find(r => r.status === 200)!.headers["set-cookie"]![0];
    expect(cookie).toContain("Secure; SameSite=Strict"); expect(cookie).toContain("HttpOnly"); expect(cookie).not.toContain("Domain"); expect(cookie).not.toContain(token);
  });
  it("rejects expired codes and sessions revoked before redemption", async () => {
    const code = await launch(); clock += 30001;
    expect((await redeem(code)).status).toBe(401);
    const second = await launch(); activeSession = false;
    expect((await redeem(second)).status).toBe(401);
  });
  it("checks redemption origin before consuming codes", async () => {
    const code = await launch();
    expect((await request(site, "/__edgegames/redeem", { method: "POST", origin: admin.origin, body: JSON.stringify({ code }) })).status).toBe(403);
    expect((await redeem(code)).status).toBe(200);
  });
  it("isolates cookies/headers and rewrites only the validated upstream origin", async () => {
    const cookie = await session();
    const response = await request(site, "/", { cookie: `${cookie}; edge-admin=${token}; _streamlit_xsrf=valid-xsrf; tower_session=secret`, headers: { authorization: "secret", "x-forwarded-host": "evil.invalid" } });
    expect(response.status).toBe(200); expect(response.body).toBe("synthetic lab");
    expect(seen[0].headers.cookie).toBe("_streamlit_xsrf=valid-xsrf");
    expect(seen[0].headers.authorization).toBeUndefined(); expect(seen[0].headers["x-forwarded-host"]).toBeUndefined();
    expect(response.headers["set-cookie"]).toEqual(["_streamlit_xsrf=valid-xsrf; Path=/; Secure; SameSite=Strict"]);
    expect(response.headers["cache-control"]).toContain("no-store");
  });
  it("preserves upstream XSRF enforcement for writes", async () => {
    const cookie = await session();
    expect((await request(site, "/upload", { cookie, method: "PUT", origin: site.origin, body: "{}" })).status).toBe(403);
    expect((await request(site, "/upload", { cookie, method: "PUT", origin: "https://evil.invalid", body: "{}", headers: { "x-xsrftoken": "valid-xsrf" } })).status).toBe(403);
    expect((await request(site, "/upload", { cookie, method: "PUT", origin: site.origin, body: "{}", headers: { "x-xsrftoken": "valid-xsrf" } })).status).toBe(200);
  });
  it("rejects traversal/absolute paths, redirects, unsupported methods and arbitrary targets", async () => {
    const cookie = await session();
    for (const path of ["//evil.invalid/", "/%2e%2e/private", "/static/%2fprivate", "/static/%252e%252e/private"]) expect((await request(site, path, { cookie })).status).toBe(400);
    expect(labPath("http://evil.invalid/")).toBeNull();
    expect((await request(site, "/", { cookie, method: "TRACE", origin: site.origin })).status).toBe(405);
    expect((await request(site, "/redirect", { cookie })).status).toBe(502);
    expect((await request(site, "/?url=http://evil.invalid/", { cookie })).status).toBe(200);
    expect(seen.at(-1)?.url).toBe("/?url=http://evil.invalid/");
  });
  it("refuses wrong-host bridge access and rejects an untrusted peer despite spoofed headers", async () => {
    expect((await request(bridgeOrigin, "/", { headers: { host: "localhost:1" } })).status).toBe(403);
    const deniedOrigin = new URL("http://127.0.0.1:1");
    const denied = createSportsLabBridge({ trustedAddress: "127.0.0.2", bridgeOrigin: deniedOrigin, labOrigin });
    denied.server.listen(0, "127.0.0.1"); await once(denied.server, "listening");
    deniedOrigin.port = String((denied.server.address() as AddressInfo).port);
    try {
      await expect(request(deniedOrigin, "/", { headers: { "x-forwarded-for": "127.0.0.2", forwarded: "for=127.0.0.2" } })).rejects.toThrow();
      await expect(new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${deniedOrigin.host}/_stcore/stream`, ["streamlit"], { origin: deniedOrigin.origin, headers: { "x-forwarded-for": "127.0.0.2" } });
        ws.once("open", () => { ws.terminate(); resolve("unexpected open"); }); ws.once("error", reject);
      })).rejects.toThrow();
      expect(seen).toHaveLength(0);
    } finally { denied.close(); }
  });
  it("denies unauthorized, wrong-origin and unexpected-path WebSocket upgrades", async () => {
    const cookie = await session();
    for (const [path, value, origin] of [["/_stcore/stream", "edge-member=secret", site.origin], ["/_stcore/stream", cookie, "https://evil.invalid"], ["/socket.io", cookie, site.origin]]) {
      await new Promise<void>(resolve => {
        const ws = new WebSocket(`wss://${site.host}${path}`, ["streamlit", "valid-xsrf"], { ca: certs.ca, origin, headers: { cookie: value } });
        ws.on("unexpected-response", (_req, res) => { expect([401, 403]).toContain(res.statusCode); res.resume(); ws.terminate(); resolve(); });
        ws.on("error", () => {});
      });
    }
    expect(seen).toHaveLength(0);
  });
  it("forwards real binary WebSocket messages and revokes an open socket before further operations", async () => {
    const cookie = await session(); const ws = await connected(cookie);
    await once(ws, "message");
    ws.send(Buffer.from("synthetic operation"));
    const [data, binary] = await once(ws, "message");
    expect(data.toString()).toBe("synthetic operation"); expect(binary).toBe(true);
    activeSession = false; const closed = once(ws, "close"); ws.send("must not forward");
    await closed; expect(wsSeen).toEqual(["synthetic operation"]);
    expect((await request(site, "/media/private.csv", { cookie })).status).toBe(401);
  });
  it("closes idle sockets on session expiration and fails closed afterward", async () => {
    const cookie = await session(); const ws = await connected(cookie); await once(ws, "message");
    const closed = once(ws, "close"); clock = expiresAt + 1; await closed;
    expect((await request(site, "/", { cookie })).status).toBe(401);
  });
  it("requires public HTTPS and only the approved fixed private HTTP bridge port", () => {
    expect(sportsLabConfig({})).toBeNull();
    expect(() => sportsLabConfig({ SPORTS_LAB_ORIGIN: "https://lab.app.example.test" })).toThrow("incomplete");
    // Synthetic, non-listening test origins; no deployment host information.
    const config = { AUTH_URL: "https://app.example.test", SPORTS_LAB_ORIGIN: "https://lab.app.example.test", SPORTS_LAB_BRIDGE_URL: "http://10.123.0.10:18501" };
    expect(sportsLabConfig(config)?.bridgeOrigin.origin).toBe(config.SPORTS_LAB_BRIDGE_URL);
    for (const url of ["http://public.invalid:18501", "http://127.0.0.1:18501", "http://10.123.0.10:8501", "https://10.123.0.10:18501", "http://10.123.0.10:18501/?url=http://evil.invalid", "http://user:secret@10.123.0.10:18501", "http://10.123.0.10:18501/path"]) expect(() => sportsLabConfig({ ...config, SPORTS_LAB_BRIDGE_URL: url })).toThrow("fixed private IPv4");
    expect(() => sportsLabConfig({ ...config, AUTH_URL: "http://app.example.test" })).toThrow("HTTPS");
    expect(() => sportsLabConfig({ ...config, SPORTS_LAB_ORIGIN: "http://lab.app.example.test" })).toThrow("HTTPS");
    expect(() => sportsLabConfig({ ...config, SPORTS_LAB_ORIGIN: config.AUTH_URL })).toThrow("dedicated subdomain");
    expect(() => sportsLabConfig({ ...config, SPORTS_LAB_TLS_KEY_FILE: "unused" })).toThrow("Legacy");
  });
  it("does not accept raw administrator cookies as Lab-host authorization", async () => {
    expect((await request(site, "/", { cookie: `edge-admin=${token}; ${LAB_RELAY_COOKIE}=invalid` })).status).toBe(401);
  });
  it("fails closed while the fixed bridge is unavailable", async () => {
    const cookie = await session(); const port = bridgeOrigin.port;
    try { bridgeOrigin.port = "1"; expect((await request(site, "/", { cookie })).status).toBe(502); }
    finally { bridgeOrigin.port = port; }
    expect(seen).toHaveLength(0);
  });
  it("rejects oversized launch payloads and never creates an upstream request", async () => {
    const response = await request(admin, LAB_LAUNCH_PATH, { method: "POST", origin: admin.origin, cookie: `edge-admin=${token}`, body: JSON.stringify({ padding: "x".repeat(2048) }) });
    expect(response.status).toBe(400); expect(seen).toHaveLength(0);
  });
});
