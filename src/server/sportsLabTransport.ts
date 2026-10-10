import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import type { Duplex } from "node:stream";
import type { ConnectionOptions } from "node:tls";
import WebSocket, { WebSocketServer } from "ws";

export const LAB_MAX_BODY = 16 * 1024 * 1024;
export const LAB_MAX_MESSAGE = 8 * 1024 * 1024;
export const LAB_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
};
export type LabTarget = { origin: URL; tls?: ConnectionOptions };
export type Authorize = () => Promise<boolean>;

export function labCookie(header: string | undefined, name: string) {
  const matches = (header || "").split(";").map(v => v.trim()).filter(v => v.startsWith(name + "="));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : undefined;
}

/** Never resolve a browser-supplied URL against the upstream (including // URLs). */
export function labPath(raw: string | undefined): string | null {
  if (!raw || raw.length > 8192 || !raw.startsWith("/") || raw.startsWith("//") || /[\\\x00-\x20\x7f#]/.test(raw)) return null;
  const path = raw.split("?", 1)[0];
  try {
    const decoded = decodeURIComponent(path);
    if (/%(?:2f|5c|25)/i.test(path) || /[\\\x00-\x1f\x7f]/.test(decoded) || decoded.split("/").some(v => v === "." || v === "..")) return null;
  } catch { return null; }
  return raw;
}

export function labFailure(res: ServerResponse, status: number, message: string) {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, { ...LAB_HEADERS, "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}
export function denyUpgrade(socket: Duplex, status = 401) {
  socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n`);
}

export async function labBody(req: IncomingMessage, limit = LAB_MAX_BODY) {
  if (Number(req.headers["content-length"]) > limit) throw new Error("BODY_LIMIT");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("BODY_LIMIT");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function upstreamHeaders(req: IncomingMessage, target: URL) {
  const headers: http.OutgoingHttpHeaders = { host: target.host };
  for (const name of ["accept", "accept-language", "content-type", "x-xsrftoken", "x-csrftoken", "range", "if-range"]) {
    const value = req.headers[name];
    if (typeof value === "string") headers[name] = value;
  }
  // Streamlit's token is forwarded unchanged. Website/relay credentials never are.
  const xsrfCookies: string[] = [];
  for (const name of ["_xsrf", "_streamlit_xsrf"]) {
    const xsrf = labCookie(req.headers.cookie, name);
    if (xsrf && /^[\x21-\x3a\x3c-\x7e]{1,4096}$/.test(xsrf)) xsrfCookies.push(`${name}=${xsrf}`);
  }
  if (xsrfCookies.length) headers.cookie = xsrfCookies.join("; ");
  if (req.headers.origin) headers.origin = target.origin;
  return headers;
}

/** Bounded HTTP proxy; fixed origin, no redirect following, no ambient cookies. */
export async function proxyLabHttp(req: IncomingMessage, res: ServerResponse, target: LabTarget, authorized: Authorize, recheckMs = 15000) {
  const path = labPath(req.url);
  if (!path) { labFailure(res, 400, "Invalid path."); return; }
  if (!["GET", "HEAD", "POST", "PUT", "DELETE"].includes(req.method || "")) { labFailure(res, 405, "Method not allowed."); return; }
  let body: Buffer;
  try { body = await labBody(req); } catch { labFailure(res, 413, "Request too large or interrupted."); return; }
  if (!(await authorized().catch(() => false))) { labFailure(res, 401, "Administrator session ended."); return; }
  const headers = upstreamHeaders(req, target.origin);
  headers["content-length"] = body.length;
  const transport = target.origin.protocol === "https:" ? https : http;
  await new Promise<void>(resolve => {
    let total = 0;
    const upstream = transport.request({
      ...target.tls, protocol: target.origin.protocol, hostname: target.origin.hostname,
      port: target.origin.port, path, method: req.method, headers,
      timeout: 20000, agent: false,
    }, response => {
      const status = response.statusCode || 502;
      if (status >= 300 && status < 400) {
        response.destroy(); labFailure(res, 502, "Unexpected Lab redirect."); finish(); return;
      }
      const safeHeaders: http.OutgoingHttpHeaders = { ...LAB_HEADERS };
      for (const name of ["content-type", "content-disposition", "content-range", "accept-ranges"]) {
        if (response.headers[name]) safeHeaders[name] = response.headers[name];
      }
      const xsrf = response.headers["set-cookie"]?.filter(v => /^(?:_xsrf|_streamlit_xsrf)=[\x21-\x3a\x3c-\x7e]{1,4096}(?:;|$)/.test(v));
      if (xsrf?.length) safeHeaders["set-cookie"] = xsrf.map(v => `${v.split(";", 1)[0]}; Path=/; Secure; SameSite=Strict`);
      res.writeHead(status, safeHeaders);
      response.on("data", chunk => {
        total += chunk.length;
        if (total > 64 * 1024 * 1024) { upstream.destroy(); res.destroy(); }
      });
      response.on("error", () => { res.destroy(); finish(); });
      response.on("end", finish);
      response.pipe(res);
    });
    const timer = setInterval(() => {
      void authorized().then(ok => { if (!ok) { upstream.destroy(); labFailure(res, 401, "Administrator session ended."); } }).catch(() => { upstream.destroy(); res.destroy(); });
    }, recheckMs);
    const deadline = setTimeout(() => upstream.destroy(new Error("TIMEOUT")), 60000);
    function finish() { clearInterval(timer); clearTimeout(deadline); resolve(); }
    upstream.on("timeout", () => upstream.destroy(new Error("TIMEOUT")));
    upstream.on("error", () => { labFailure(res, 502, "Sports Lab is unavailable."); finish(); });
    res.on("close", () => { upstream.destroy(); finish(); });
    upstream.end(body);
  });
}

export function labSocketServer() {
  return new WebSocketServer({ noServer: true, maxPayload: LAB_MAX_MESSAGE, perMessageDeflate: false,
    handleProtocols: protocols => protocols.has("streamlit") ? "streamlit" : false });
}

/** Both directions revalidate before forwarding; idle sockets are also revoked. */
export function proxyLabSocket(client: WebSocket, req: IncomingMessage, target: LabTarget, authorized: Authorize, recheckMs = 15000) {
  const path = labPath(req.url);
  if (!path || path.split("?", 1)[0] !== "/_stcore/stream") { client.terminate(); return () => {}; }
  const protocols = (req.headers["sec-websocket-protocol"] || "").split(",").map(v => v.trim()).filter(Boolean);
  const url = `${target.origin.protocol === "https:" ? "wss:" : "ws:"}//${target.origin.host}${path}`;
  const upstream = new WebSocket(url, protocols, {
    ...target.tls, headers: upstreamHeaders(req, target.origin),
    maxPayload: LAB_MAX_MESSAGE, perMessageDeflate: false, followRedirects: false, handshakeTimeout: 10000,
  });
  let closed = false;
  let pending = 0;
  let queue = Promise.resolve();
  const stop = () => {
    if (closed) return;
    closed = true; clearInterval(timer);
    client.terminate(); upstream.terminate();
  };
  const check = async () => !closed && await authorized().catch(() => false);
  const timer = setInterval(() => { void check().then(ok => { if (!ok) stop(); }); }, recheckMs);
  client.pause();
  upstream.on("open", () => { if (!closed) client.resume(); });
  function relay(source: WebSocket, destination: WebSocket) {
    source.on("message", (data, binary) => {
      const bytes = Array.isArray(data) ? data.reduce((sum, v) => sum + v.length, 0) : data instanceof ArrayBuffer ? data.byteLength : data.length;
      pending += bytes;
      if (pending > LAB_MAX_MESSAGE) { stop(); return; }
      source.pause();
      queue = queue.then(async () => {
        if (!(await check()) || destination.readyState !== WebSocket.OPEN || destination.bufferedAmount > LAB_MAX_MESSAGE) { stop(); return; }
        await new Promise<void>((resolve, reject) => destination.send(data, { binary }, error => error ? reject(error) : resolve()));
        pending -= bytes;
        if (!closed) source.resume();
      }).catch(stop);
    });
    source.on("error", stop); source.on("close", stop);
  }
  relay(client, upstream); relay(upstream, client);
  return stop;
}
