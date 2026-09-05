import { createServer, type IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
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
  RATE_LIMITS,
  takeAccountRateLimit,
} from "./src/lib/rateLimit";
import { QueueCapacityExceededError } from "./src/server/keyedCoordination";
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
const retiredExampleSecret = "dev-secret-change-me-please-0000000000000000";
if (
  dev &&
  (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === retiredExampleSecret)
) {
  // Keep an unconfigured checkout usable without publishing a shared signing
  // key. Sessions intentionally expire whenever this dev process restarts.
  process.env.AUTH_SECRET = randomBytes(32).toString("base64url");
  console.warn(
    "AUTH_SECRET is unset; using an ephemeral development secret for this process.",
  );
}
const hostname = process.env.HOST?.trim() || (dev ? "127.0.0.1" : "0.0.0.0");
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * Reject browser handshakes from foreign origins. Node/native clients such as
 * the local autoplayer do not send Origin and authenticate with their session
 * cookie, so they remain supported. Production validation requires AUTH_URL;
 * the Host fallback exists only for local development.
 */
function isAllowedSocketRequest(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    return false;
  }

  const authUrl = process.env.AUTH_URL;
  if (authUrl) {
    try {
      return parsedOrigin.origin === new URL(authUrl).origin;
    } catch {
      return false;
    }
  }

  const forwardedHost = req.headers["x-forwarded-host"];
  const requestHost =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
      ?.split(",", 1)[0]
      ?.trim() ?? req.headers.host;
  return Boolean(requestHost && parsedOrigin.host === requestHost);
}

function runSocketAction(socket: SocketT, action: () => Promise<void>): void {
  void Promise.resolve()
    .then(action)
    .catch((error: unknown) => {
      if (error instanceof QueueCapacityExceededError) {
        socket.emit("errorMsg", {
          message: "Too many actions are queued. Slow down and try again.",
        });
        return;
      }
      console.error("Socket action failed", error);
      socket.emit("errorMsg", {
        message: "The action could not be completed. Please try again.",
      });
    });
}

/** Reject accepted events before they can add work to a match queue. */
function runThrottledSocketAction(
  socket: SocketT,
  action: () => Promise<void>,
): void {
  const userId = socket.data.userId as string | undefined;
  if (!userId) {
    socket.emit("errorMsg", { message: "Unauthorized" });
    return;
  }
  const rateLimit = takeAccountRateLimit(
    "realtime:action",
    userId,
    RATE_LIMITS.realtimeActions,
  );
  if (!rateLimit.allowed) {
    socket.emit("errorMsg", {
      message: `Too many actions. Try again in ${rateLimit.retryAfterSeconds}s.`,
    });
    return;
  }
  runSocketAction(socket, action);
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
  runThrottledSocketAction(socket, () => action(parsed.data));
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url ?? "/", true));
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: SOCKET_PATH,
    allowRequest: (req, callback) => {
      callback(null, isAllowedSocketRequest(req));
    },
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
      runThrottledSocketAction(socket, () => handleNext(io, socket));
    });
    socket.on("match:end", () => {
      runThrottledSocketAction(socket, () => handleEndMatch(io, socket));
    });
    socket.on("disconnect", () => {
      runSocketAction(socket, () => handleDisconnect(io, socket));
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Five-O Poker ready on http://${hostname}:${port}`);
  });
});
