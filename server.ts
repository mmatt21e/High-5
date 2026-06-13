import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server } from "socket.io";
import { SOCKET_PATH } from "./src/lib/realtime/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./src/lib/realtime/events";
import { userIdFromCookie } from "./src/server/socketAuth";
import {
  handleJoin,
  handlePlace,
  handleNext,
  handleDisconnect,
} from "./src/server/gameManager";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url ?? "/", true));
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: SOCKET_PATH,
  });

  // Authenticate every socket from the Auth.js session cookie.
  io.use(async (socket, nextFn) => {
    const userId = await userIdFromCookie(socket.handshake.headers.cookie);
    if (!userId) return nextFn(new Error("Unauthorized"));
    socket.data.userId = userId;
    nextFn();
  });

  io.on("connection", (socket) => {
    socket.on("match:join", ({ code }) => {
      void handleJoin(io, socket, code);
    });
    socket.on("game:place", ({ column }) => {
      void handlePlace(io, socket, column);
    });
    socket.on("game:next", () => {
      void handleNext(io, socket);
    });
    socket.on("disconnect", () => {
      void handleDisconnect(io, socket);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Five-O Poker ready on http://${hostname}:${port}`);
  });
});
