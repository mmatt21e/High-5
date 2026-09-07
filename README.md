# Five-O Poker

Five-O Poker is a mobile-first, heads-up poker game played in real time across
two devices. Players can search for another player's name and send an invitation,
or create a match and share an eight-character invite code. A named invitation
starts a match only when its recipient accepts; invite-code joining remains
available, including legacy five-character codes. Both players play against a
server-authoritative deck and game engine. You can also play a computer opponent
on one device, with the same rules and saved-match support.

## Computer opponents

Choose **Play the computer** from the signed-in lobby:

- **Lucky Guppy** (relaxed): unpredictable legal placements for learning the game.
- **Sneaky Stacker** (strategic): builds combinations and protects its concealed
  hand, with occasional experimental plays.
- **The Cardfather** (advanced): combines hand-building with 64 sampled possible
  completions per decision, compares your visible rows, and considers discards.

Every level sees only its own hand and the public board. No opponent can read
your hidden cards or future draws. Computer turns run on the server; no external
AI service, API key, or second device is needed. Internet/server access and a
signed-in account are still required.

Computer results count in overall stats. Each named opponent has a separate
head-to-head record and history filter. Games resume after leaving or restarting
the server, and **Next game** only needs the human player to be ready. Human
search, named invitations, and invite-code matches remain available unchanged.

## Players, history and avatars

- Search uses the player name chosen at registration. Names need not be unique;
  avatars and a short player identifier distinguish search results. Search is
  available only to signed-in players and does not return email addresses.
- The lobby lists incoming and outgoing invitations and refreshes while visible.
  Recipients can accept or decline; senders can cancel pending invitations.
  Acceptance reserves both seats and can be retried without creating another match.
- **Profile & history** shows overall game wins, losses and pushes, completed
  match records, opponent-by-opponent records and paginated game history. Selecting
  an opponent filters that history. Unfinished or manually ended matches are not
  counted as match wins or losses; completed games within them still count.
- Avatars are saved to the account. Choose one of eight built-in avatars or upload
  a still JPEG, PNG or WebP up to 2 MB / 16 megapixels. Uploads are center-cropped,
  resized to 128×128 WebP, stripped of metadata and kept in SQLite with the account.
- Table rows use continuous placement areas. The center draw deck shows the
  server's remaining-card count; cards are drawn automatically at the start of a
  turn. All ten deck styles keep card indices separate from their vector artwork.

Existing installations must run `npm run db:migrate` before starting this version.
The additive `20260907000000_computer_opponents` migration adds nullable computer
identity metadata; existing accounts remain human. It preserves existing accounts,
invitations, matches and results. Migration SQL uses LF line endings on every platform
so released checksums remain stable.

## Game rules

Both players build five poker hands from one shared 52-card deck:

- Each player starts with a concealed five-card hand.
- On each turn, draw one card and place either that card or a held card into one
  of four visible rows. The concealed hand remains at five cards.
- Each player may discard one held card instead of placing it, once per game.
- When all four visible rows are complete, the concealed cards become the fifth
  hand and corresponding hands are compared.
- Winning at least three hands wins the game. Sweeping all five is a Five-O.

Matches default to first-to-five game wins. Results update both match scores and
lifetime player statistics.

## Architecture and support boundary

| Layer | Technology |
|---|---|
| Web app | Next.js App Router, React, TypeScript, Tailwind CSS |
| Realtime server | Custom Node.js server with Socket.IO |
| Authentication | Auth.js credentials and optional Google OAuth |
| Data | Prisma with SQLite |
| Tests | Vitest |

SQLite is the only supported database provider. The checked-in migrations are
SQLite-specific; changing providers requires a separately designed and tested
migration history.

Game moves, hidden cards, and deck state are authoritative on the server. Each
production deck is shuffled with an unbiased operating-system random draw at
every Fisher-Yates step; deterministic numeric seeds exist only for engine
tests. Active game snapshots, completed games, scores, and stats are persisted
in SQLite, so a single server process can hydrate a match after restart. Live
coordination and rate limits remain process-local, so current production
deployments must use exactly one application replica on durable local storage.
A serverless or horizontally scaled deployment is not supported.

## Local setup

Node.js 22 is required.

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`, register two users in separate browsers, create a
match in one, and join it from the other. Or sign in with one account and choose
a named opponent under **Play the computer**.

Development binds to `127.0.0.1` by default. If `AUTH_SECRET` is empty (or still
contains the retired published placeholder), the dev server generates an
ephemeral secret and sessions expire on restart. Generate and save a unique
local secret if you want sessions to survive restarts; always inject a unique
secret in production:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

### Docker quick start

Docker Desktop can run the complete production-style application, guarded
database migrations, and persistent SQLite storage locally:

```powershell
.\deploy\Initialize-DockerEnv.ps1
.\deploy\Start-Docker.ps1 -Mode Local
```

The local listener is restricted to `127.0.0.1:3000`. Two opt-in public modes
are also included for a future hostname: direct HTTPS through Caddy, or an
outbound-only Cloudflare Tunnel. Neither is activated by default, and neither
publishes the application container's port 3000. See
[`docs/DOCKER_HOSTING.md`](docs/DOCKER_HOSTING.md) for setup, updates, backups,
DNS and router requirements, tunnel configuration, and the public-release
security checklist.

## Configuration

Required in production:

| Variable | Requirement |
|---|---|
| `DATABASE_URL` | Persistent SQLite `file:` URL, such as `file:/data/five-o.db` |
| `AUTH_SECRET` | Random value of at least 32 characters; no example placeholder |
| `AUTH_URL` | Public HTTPS origin, with no path or query |
| `PORT` | Optional integer from 1 through 65535; defaults to `3000` |

Google sign-in is optional. Configure `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and
`NEXT_PUBLIC_GOOGLE_ENABLED=true` together, or leave credentials empty and the
flag false. Configure all four web-push values together:
`VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`. The two public keys must match. Generate VAPID
keys with:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

`npm start` loads standard Next.js production env files and validates the
configuration before starting the server. It reports variable names and rules,
never secret values. Run the same check independently with `npm run env:check`.

## Database migrations

`npm run db:migrate` is the guarded deployment entry point. For a new database,
it applies the complete baseline and every later migration. It also recognizes
two historical SQLite states: a verified pre-migration `db push` database and a
database already upgraded at commit `11b1f48` with only the atomic-completion
migration recorded. For those exact states, it safely records the missing
baseline before applying later migrations. Do not use `prisma db push` in
production.

Back up an existing database and stop all app processes before upgrading it:

```bash
# DATABASE_URL must point to the existing SQLite file.
npm run db:migrate
npm run db:migrate:status
```

The deployment preflight rejects foreign-key violations, unknown or partial
schemas, unsupported migration histories, unfinished migration records, and
applied-migration checksum changes before altering the database. The already
released `20260905150000_atomic_game_completion` migration remains immutable;
the preflight protects legacy upgrades and the later forward-only integrity
migration verifies the resulting foreign keys.

That forward migration also assigns the explicit legacy nonce `0` to an active
persisted game that predates seed storage. Its complete deck is already in
`gameState`; the sentinel anchors the completion compare-and-swap without
claiming that the historical deck can be reconstructed from a seed.

`npm run verify:migrations` performs four isolated checks: a fresh migration, a
seeded legacy `db push` database, the exact delta-only history accepted at
`11b1f48`, and an orphaned legacy database that must fail before schema or
history alteration. It also checks schema drift, migration records, migrated
data, the accepted delta's fixed checksum, and SQLite foreign keys.

## Production deployment

Use a host that supports a long-running Node.js 22 process, WebSockets, and a
durable filesystem. Configure one replica, mount persistent storage for the
SQLite file, and include the database in the backup plan. Any reverse proxy
must preserve WebSocket upgrade requests. Sticky sessions alone do not make a
multi-replica deployment safe because the live registry and locks are not shared.
Apply source-address request limits at the edge as well: repository-level
registration and realtime limits deliberately provide only a process-local
backstop.

```bash
npm ci
npm run env:check
npm run db:migrate
npm run build
npm prune --omit=dev
npm start
```

The runtime tools required by the custom TypeScript server, environment loader,
and migrations are production dependencies, so the final two commands work
after development dependencies are pruned.

The checked-in Docker stack implements this single-replica topology and runs
the guarded migration as a separate one-shot service before the app starts.
Use the supplied PowerShell launcher instead of starting additional app
containers manually.

## Quality commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server with TypeScript watch mode |
| `npm run build` | Generate Prisma Client and build Next.js |
| `npm start` | Validate production config and run the custom server |
| `npm run env:check` | Validate production configuration without starting |
| `npm run lint` | Run ESLint with zero warnings allowed |
| `npm run typecheck` | Run a clean, nonincremental TypeScript check |
| `npm test` | Run the Vitest suite once |
| `npm run verify:migrations` | Exercise fresh, legacy, 11b1f48, and invalid SQLite histories |
| `npm run check` | Run lint, typecheck, tests, and migration verification |
| `npm run db:migrate` | Apply pending tracked migrations |
| `npm run db:migrate:status` | Report migration state |
| `npm run db:push` | Update a disposable local database without migration history |
| `npm run db:studio` | Open Prisma Studio |

GitHub Actions runs the audit, lint, typecheck, tests, migration verification,
environment validation, production build, production-only dependency prune,
and a real startup smoke test on Node.js 22. A dependent Docker job validates
all three Compose modes and the Caddy configuration, builds the image, starts
an isolated local stack, and checks its database-backed health endpoint.

## Project map

```text
server.ts                           Next.js and Socket.IO custom server
Dockerfile                         Pinned Node.js 22 production image
compose.yaml                       App, migration job, and durable SQLite volume
compose.local.yaml                 Loopback-only local listener
compose.public.yaml                Caddy HTTPS gateway (opt in)
compose.tunnel.yaml                Cloudflare Tunnel gateway (opt in)
deploy/
  Start-Docker.ps1                Validated migrate-and-start workflow
  Stop-Docker.ps1                 Stop containers while retaining volumes
  Caddyfile                        HTTPS and WebSocket reverse proxy
prisma/
  schema.prisma                    SQLite application schema
  migrations/                     Tracked baseline and deltas
scripts/
  deploy-migrations.mjs           Guarded migration preflight and deployment
  verify-migrations.mjs           Migration lifecycle regression checks
  validate-production-env.mjs     Production configuration check
  start.mjs                       Validated production launcher
src/
  auth.ts                         Auth.js configuration
  lib/game/                       Pure Five-O engine and evaluator
  lib/match.ts                    Invite-code and seat-claim operations
  lib/realtime/                   Socket contracts and payload validation
  server/gameManager.ts           Single-process live-match coordination
  server/completedGamePersistence.ts  Transactional result persistence
  app/                            Pages and HTTP routes
  components/                     Game, lobby, account, and push UI
```

The dated engineering review is in
[`docs/PROJECT_REVIEW_2026-09-05.md`](docs/PROJECT_REVIEW_2026-09-05.md).
