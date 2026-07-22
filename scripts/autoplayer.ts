// Headless auto-player used to exercise the live two-player game during manual
// testing. Registers (or reuses) a bot account, mints an Auth.js session cookie
// with the app's own AUTH_SECRET, connects over Socket.IO, joins the given
// invite code, and plays the first legal move on every turn.
//
//   npx tsx scripts/autoplayer.ts <INVITE_CODE> [displayName] [email]

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { io } from "socket.io-client";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import { SOCKET_PATH } from "../src/lib/realtime/events";
import type { GameView } from "../src/lib/game/types";

// Minimal .env loader (no dotenv dependency).
function loadEnv() {
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* no .env — rely on the ambient environment */
  }
}
loadEnv();

const code = process.argv[2];
const displayName = process.argv[3] ?? "Botley";
const email = (process.argv[4] ?? "botley@example.com").toLowerCase();
const password = "botpassword123";

if (!code) {
  console.error("Usage: tsx scripts/autoplayer.ts <INVITE_CODE> [name] [email]");
  process.exit(1);
}

const BASE = `http://localhost:${process.env.PORT ?? "3000"}`;
const prisma = new PrismaClient();

async function ensureUser(): Promise<string> {
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName, email, password }),
  }).catch(() => {});
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Could not create/find bot user");
  return user.id;
}

async function mintCookie(uid: string): Promise<string> {
  const cookieName = "authjs.session-token"; // dev (http) cookie name
  const token = await encode({
    token: { uid, displayName, name: displayName, email },
    secret: process.env.AUTH_SECRET as string,
    salt: cookieName,
    maxAge: 60 * 60,
  });
  return `${cookieName}=${token}`;
}

async function restJoin(cookie: string): Promise<void> {
  // Claim the guest seat exactly like the browser Lobby does.
  const res = await fetch(`${BASE}/api/match/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST join failed: ${data.error ?? res.status}`);
  console.log("[bot] REST join ok:", data);
}

async function main() {
  const uid = await ensureUser();
  const cookie = await mintCookie(uid);
  console.log(`[bot] ${displayName} (${uid}) joining ${code}…`);

  await restJoin(cookie);

  const socket = io(BASE, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    extraHeaders: { cookie },
  });

  socket.on("connect", () => {
    console.log("[bot] connected, emitting match:join");
    socket.emit("match:join", { code });
  });
  socket.on("connect_error", (e: Error) =>
    console.error("[bot] connect_error:", e.message),
  );
  socket.on("errorMsg", (p: { message: string }) =>
    console.error("[bot] errorMsg:", p.message),
  );

  socket.on("game:view", (view: GameView | null) => {
    if (!view) return;
    if (view.phase === "complete") {
      console.log("[bot] game complete — hand wins:", view.result?.handWins);
      socket.emit("game:next"); // stay ready for another game
      return;
    }
    if (view.yourTurn && view.legalRows.length > 0) {
      const card = view.players[view.you].hand.find((item) => item.state === "card");
      if (!card || card.state !== "card") return;
      const cardId = `${card.card.rank}${card.card.suit}`;
      const row = view.legalRows[0];
      console.log(
        `[bot] placing ${cardId} -> row ${row} (placed ${view.placed[view.you]}/20)`,
      );
      setTimeout(() => socket.emit("game:place", { cardId, row }), 300);
    }
  });

  process.on("SIGINT", () => {
    socket.disconnect();
    void prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
