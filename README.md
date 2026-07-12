# Five-O Poker

A mobile-first web app for **Five-O Poker** — a heads-up poker variant played
between two players on two different devices. One player creates a game, shares
an invite code, and the second player joins to play in real time.

## What is Five-O Poker?

Two players each build **five poker hands** from a **single shared 52-card
deck** — four rows the opponent can see, plus one concealed hand only you can
see:

- Each player is dealt a **concealed hand of 5 cards** to start.
- Players alternate turns. On your turn you **draw one card** (now holding six),
  then place **one card** — the drawn card or a held one — into one of your
  **four face-up rows** that still has room. You always keep 5 cards concealed.
- **Once per game** you may **discard** a held card instead of placing it.
- When both players have filled all four rows, everything is revealed. Your held
  5 cards are your **concealed 5th hand**.
- At showdown, each of your five hands is compared head-to-head with the
  opponent's in the same spot. **Win 3+ of the 5 to win the game.** Winning all
  five is a **"Five-O"**.

Matches are **first-to-5 game wins** (configurable), and every result feeds your
lifetime stats.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + React + TypeScript + Tailwind CSS, mobile-first PWA |
| Realtime | Socket.IO on a custom Node server, **server-authoritative** game engine |
| Auth | Auth.js (NextAuth) — email/password + optional Google OAuth |
| Database | Prisma — SQLite for dev, Postgres for production |

The game engine lives entirely on the server, so clients never receive the
opponent's concealed hand or the deck order. The engine is pure and fully
unit-tested (`src/lib/game`).

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   For local dev the defaults work. Generate a real AUTH_SECRET with:
#   npx auth secret   (or: openssl rand -base64 32)

# 3. Create the database
npm run db:push

# 4. Run the dev server (custom server: Next.js + Socket.IO)
npm run dev
# -> http://localhost:3000
```

Open two browsers (or a phone + laptop), sign up as two users, create a game on
one, and join with the code on the other.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm run start` | Production server |
| `npm test` | Run the game-engine unit tests (Vitest) |
| `npm run db:push` | Sync the Prisma schema to the database |
| `npm run db:studio` | Open Prisma Studio |

## Project structure

```
server.ts                     Custom Node server: Next.js + Socket.IO
prisma/schema.prisma          Users, stats, matches, games
src/
  auth.ts                     Auth.js configuration
  lib/
    game/                     Pure, tested game engine
      cards.ts                Deck, shuffle, seeded RNG
      evaluator.ts            5-card hand evaluation + tie-breaking
      engine.ts               Five-O state machine + redaction
      types.ts                Shared game types
    match.ts                  Invite codes, create/join
    realtime/events.ts        Shared Socket.IO event contracts
  server/
    gameManager.ts            In-memory live matches, scoring, persistence
    socketAuth.ts             Decodes the Auth.js JWT for socket handshakes
  app/                        Next.js routes (lobby, auth, play, profile, APIs)
  components/                 UI: board, cards, lobby, realtime hook
```

## Production deployment

1. Provision Postgres (Railway, Render, Neon, …).
2. In `prisma/schema.prisma` set the datasource `provider` to `"postgresql"`.
3. Set environment variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`
   (your HTTPS URL), and optionally `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` +
   `NEXT_PUBLIC_GOOGLE_ENABLED=true`.
4. Deploy to a host that supports **long-running Node + WebSockets**
   (Railway/Render/Fly) — serverless platforms can't hold persistent socket
   connections.
5. `npm run build` then `npm run start`.

### Note on live state

Completed games, match scores, and lifetime stats are persisted to the
database. The *in-progress* game state (deck, hidden cards, current turn) lives
in server memory, so a server restart abandons any game mid-play — acceptable
for this version and easy to extend later by snapshotting active games.
