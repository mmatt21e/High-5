import http from "node:http";
import { isIP, type Socket } from "node:net";
import { LAB_HEADERS, denyUpgrade, labFailure, labPath, labSocketServer, proxyLabHttp, proxyLabSocket } from "./sportsLabTransport";

/** The caller supplies reviewed local configuration, never a URL from a request. */
export function createSportsLabBridge(options: {
  trustedAddress: string; bridgeOrigin: URL; labOrigin: URL;
}) {
  if (options.labOrigin.protocol !== "http:" || options.labOrigin.hostname !== "127.0.0.1" || options.labOrigin.pathname !== "/" || options.labOrigin.search || options.labOrigin.hash || options.labOrigin.username || options.labOrigin.password) throw new Error("Lab must be a fixed loopback HTTP origin.");
  if (isIP(options.trustedAddress) !== 4 || options.bridgeOrigin.protocol !== "http:") throw new Error("Bridge requires one exact IPv4 peer and an HTTP listener.");
  const target = { origin: options.labOrigin };
  const sockets = labSocketServer();
  const active = new Set<() => void>();
  let requests = 0;
  function trusted(socket: Socket) {
    // Use the real TCP peer, never forwarded headers supplied by a caller.
    return socket.remoteAddress === options.trustedAddress || socket.remoteAddress === `::ffff:${options.trustedAddress}`;
  }
  const server = http.createServer((req, res) => {
    if (!trusted(req.socket)) { labFailure(res, 403, "Bridge peer rejected."); return; }
    if (req.headers.host !== options.bridgeOrigin.host || req.headers.origin && req.headers.origin !== options.bridgeOrigin.origin || !["GET", "HEAD"].includes(req.method || "") && req.headers.origin !== options.bridgeOrigin.origin) { labFailure(res, 403, "Origin or host rejected."); return; }
    if (requests >= 16) { labFailure(res, 503, "Try again shortly."); return; }
    requests++;
    void proxyLabHttp(req, res, target, async () => trusted(req.socket))
      .catch(() => labFailure(res, 502, "Lab unavailable."))
      .finally(() => requests--);
  });
  server.on("connection", socket => { if (!trusted(socket)) socket.destroy(); });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.on("connect", (_req, socket) => denyUpgrade(socket, 405));
  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    const path = labPath(req.url);
    if (!trusted(req.socket) || req.headers.host !== options.bridgeOrigin.host || req.headers.origin !== options.bridgeOrigin.origin || path?.split("?", 1)[0] !== "/_stcore/stream" || active.size >= 16) { denyUpgrade(socket, 403); return; }
    sockets.handleUpgrade(req, socket, head, client => {
      const stop = proxyLabSocket(client, req, target, async () => trusted(req.socket));
      active.add(stop); client.once("close", () => active.delete(stop));
    });
  });
  server.on("clientError", (_error, socket) => { if (!socket.destroyed) socket.end(`HTTP/1.1 400 Bad Request\r\nConnection: close\r\n${Object.entries(LAB_HEADERS).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`); });
  return { server, close: () => { for (const stop of active) stop(); sockets.close(); server.closeAllConnections(); server.close(); } };
}
