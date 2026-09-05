import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server, type Socket } from "socket.io";
import type { ZodType } from "zod";
import { SOCKET_PATH } from "./src/lib/realtime/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./src/lib/realtime/events";
import {
  discardPayloadSchema,
  matchJoinPayloadSchema,
  placePayloadSchema,
} from "./src/lib/realtime/validation";
import { userIdFromCookie } from "./src/server/socketAuth";
import {
  handleJoin,
  handlePlace,
  handleDiscard,
  handleNext,
  handleEndMatch,
  handleDisconnect,
} from "./src/server/gameManager";

type SocketT = Socket<ClientToServerEvents, ServerToClientEvents>;

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function runSocketAction(socket: SocketT, action: () => Promise<void>): void {
  void Promise.resolve()
    .then(action)
    .catch((error: unknown) => {
      console.error("Socket action failed", error);
      socket.emit("errorMsg", {
        message: "The action could not be completed. Please try again.",
      });
    });
}

function runValidatedSocketAction<T>(
  socket: SocketT,
  schema: ZodType<T>,
  payload: unknown,
  action: (value: T) => Promise<void>,
): void {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    socket.emit("errorMsg", { message: "Invalid realtime action" });
    return;
  }
  runSocketAction(socket, () => action(parsed.data));
}

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
    socket.on("match:join", (payload: unknown) => {
      runValidatedSocketAction(
        socket,
        matchJoinPayloadSchema,
        payload,
        ({ code }) => handleJoin(io, socket, code),
      );
    });
    socket.on("game:place", (payload: unknown) => {
      runValidatedSocketAction(
        socket,
        placePayloadSchema,
        payload,
        ({ cardId, row }) => handlePlace(io, socket, cardId, row),
      );
    });
    socket.on("game:discard", (payload: unknown) => {
      runValidatedSocketAction(
        socket,
        discardPayloadSchema,
        payload,
        ({ cardId }) => handleDiscard(io, socket, cardId),
      );
    });
    socket.on("game:next", () => {
      runSocketAction(socket, () => handleNext(io, socket));
    });
    socket.on("match:end", () => {
      runSocketAction(socket, () => handleEndMatch(io, socket));
    });
    socket.on("disconnect", () => {
      runSocketAction(socket, () => handleDisconnect(io, socket));
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Five-O Poker ready on http://${hostname}:${port}`);
  });
});
