# Five-O Poker Engineering Review — 2026-09-05

## Decision

Five-O Poker is a conditional release candidate for a small, single-replica
deployment. The current worktree has server-authoritative gameplay, resumable
SQLite snapshots, transactional completion, bounded account and push operations,
tracked migrations, production configuration validation, and automated quality
gates. It is not approved for horizontal scaling, serverless hosting, or a
database provider other than SQLite.

The release condition matters: live-match coordination, keyed locks, and rate
limits are process-local. SQLite also requires a durable filesystem and an
operator-owned backup/restore procedure. A reverse proxy must preserve WebSocket
upgrades; sticky sessions do not replace the missing shared coordination layer.

## Review boundary

This review covers the `improve/high-5-review-20260905` branch based on accepted
checkpoint `11b1f48`, including the final Round-3 critic corrections present on
2026-09-05. Results below are from the local worktree. The new GitHub Actions
workflow pins Node.js 22, but its hosted run is not evidence until the branch is
pushed and the workflow completes.

Generated `graphify-out/` data is a local review artifact and is not part of the
release commit. Unrelated local artifacts were not edited.
No PostgreSQL compatibility is claimed: `prisma/schema.prisma`, its lock file,
the baseline, and the delta are intentionally SQLite-specific.

## Three-round improvement result

| Stage | Weighted score | Outcome |
|---|---:|---|
| Baseline | 33.6 / 100 | Critical multiplayer trust, scoring, migration, and production-readiness gaps confirmed |
| Round 1 | 58.2 / 100 | Server-authoritative rules, invite/auth safety, payload validation, reconnect, PWA privacy, and lint restored |
| Round 2 | 58.3 / 100 | Atomic/idempotent completion, serialized mutations, rollback, and migration delta added; migration lifecycle gaps remained |
| Round 3 | **82.3 / 100** | Accepted by the final critic with no confirmed P0/P1 code defect inside the documented deployment boundary |

The final rubric scored core correctness 8/10, security/data integrity 8/10,
automated verification 9/10, realtime/persistence resilience 8/10,
UX/accessibility/PWA safety 8/10, and maintainability/deployment 9/10.

The refreshed architecture graph contains 710 nodes, 1,180 edges, and 41
communities; its benchmark estimated an 8.4x average query-context reduction
over the 35,500-word corpus. The graph extractor reported that its optional SQL
parser was unavailable, so the three migration SQL files are not represented in
that visualization. They were instead reviewed directly and exercised by the
migration verifier described below.

## Confirmed strengths

### Gameplay and persistence

- `server.ts` authenticates Socket.IO handshakes, rejects foreign browser
  origins, validates untrusted payloads, and throttles accepted actions before
  they can enter a bounded per-match mutation queue.
- `src/server/gameManager.ts` keeps hidden cards and deck order on the server,
  uses an unbiased operating-system random integer for every production shuffle
  step, serializes active game state, and hydrates persisted matches after
  restart. Numeric seeded shuffles are now a deterministic test facility only.
- `src/server/completedGamePersistence.ts` commits the completed game, score,
  match status, and player stats through one guarded Prisma transaction. It
  compares the authoritative participants, score, target, game number, shuffle
  nonce, and exact pre-final state; same-game retries must also match the stored
  final state. The `(matchId, gameNumber)` identity remains idempotent.
- `src/lib/match.ts` uses conditional seat claims and creates eight-character
  invite codes while preserving legacy five-character join compatibility.

### Account and push boundaries

- Registration and credential login apply password byte limits, normalized
  email handling, account limits, and a process-wide registration backstop that
  bounds bcrypt/database work even when email addresses rotate.
- Match creation/join and push subscription endpoints return bounded `429`
  responses with `Retry-After` where appropriate.
- Push subscription storage is ownership-aware and capped per account. Sending
  revalidates persisted endpoints, limits concurrency, applies a timeout, and
  removes invalid or expired subscriptions.
- Browser subscription checks distinguish endpoint ownership from device-cap
  conflicts. Disable/sign-out paths have a short network deadline and remove
  the browser capability even if server cleanup fails.
- Client snapshots use seat numbers instead of disclosing durable database user
  IDs. Response headers deny framing and set content-type, referrer, object,
  base-URI, and browser-permission baselines.

### Database lifecycle

- `20260905000000_initial_sqlite_baseline` now contains the complete schema that
  existed before tracked migrations were introduced. A fresh
  migration deployment no longer starts with a delta against missing tables.
- The already-released `20260905150000_atomic_game_completion` file is preserved
  byte-for-byte, so databases that recorded it at commit `11b1f48` retain a
  valid checksum. It adds `Match.gameSeed` and `Game.gameNumber`, preserves
  legacy rows, and creates the composite unique index.
- `scripts/deploy-migrations.mjs` validates SQLite foreign keys, exact expected
  schema state, known migration history, completed records, and applied-file
  checksums before mutation. It can reconcile both an exact pre-migration
  `db push` database and the delta-only `11b1f48` history by recording the
  verified baseline. Unknown or invalid states fail closed.
- `20260905200000_verify_foreign_key_integrity` is a new forward-only guard that
  checks the final database without rewriting the previously applied delta. It
  also assigns an explicit recovery nonce to an active legacy game whose deck
  is already preserved in `gameState`, so that game can still finish.
- `scripts/verify-migrations.mjs` verifies an empty database, a seeded legacy
  `db push` database, the exact accepted `11b1f48` predecessor history, and a
  deliberately orphaned legacy database that must fail before schema or history
  alteration. It also checks final schema drift, migration records, row
  numbering, seeds, the accepted delta's fixed checksum, cascading foreign keys,
  and `PRAGMA foreign_key_check`.

### Runtime and delivery

- `package.json` declares Node.js 22 and includes clean lint, Prisma-generating
  nonincremental typecheck, schema validation, test, migration, environment,
  and startup-smoke commands. Typechecking therefore remains valid immediately
  after a clean install instead of depending on a prior build side effect.
- `tsx`, `@next/env`, and the Prisma CLI are production dependencies. The custom
  TypeScript server, env-file loader, and migration command remain available
  after `npm prune --omit=dev`; `cross-env` remains development-only.
- Production startup loads Next.js production env files and fails before boot
  for unsupported databases, placeholder secrets, unsafe auth origins,
  incoherent Google settings, malformed VAPID keys, mismatched public keys, or
  invalid ports. Error messages do not echo secret values.
- `.env*` files are ignored except `.env.example`; SQLite journal, WAL, and SHM
  files are also ignored.
- `.github/workflows/quality.yml` pins Node.js 22 and gates audit, lint,
  typecheck, tests, migration paths, env validation, build, production-only
  pruning, dependency integrity, and a real HTTP startup smoke test.

## Local verification evidence

| Check | Observed result |
|---|---|
| `npm audit --json` | 0 vulnerabilities across production and development dependencies |
| `npm run lint` | Passed with zero warnings |
| `npm run typecheck` | Generated the Prisma client, then passed with `--incremental false` |
| `npm test` | 15 test files and 123 tests passed |
| `npm run verify:migrations` | Fresh, legacy db-push, exact `11b1f48`, and rejected-orphan SQLite paths passed |
| `npm run env:check` with valid production values | Passed |
| `npm run build` | Optimized Next.js production build passed; 13 routes generated/analyzed |
| `npm prune --omit=dev` | Completed; production tree audited with 0 vulnerabilities |
| `npm ls --omit=dev` | Production dependency tree valid; runtime tools present |
| `npm run smoke:start` after prune | Server reached `/api/auth/session` successfully and shut down |
| `npm outdated --long` | Declared ranges are at their wanted versions; remaining updates are breaking-major or prerelease decisions |
| Production two-client browser smoke | Authenticated host and headless guest joined; a host move and guest reply crossed the live Socket.IO path |
| Accessibility/mobile browser smoke | Settings focus entry, Escape close, and restoration passed; 320px invite page had no horizontal overflow |
| Production response headers | CSP, frame denial, `nosniff`, referrer policy, and camera/geolocation/microphone denial observed |

The local machine used Node.js 24.16.0, which is why npm printed an expected
engine warning against the deliberately narrower `22.x` package contract. The
workflow is the authoritative Node.js 22 gate and still needs its first hosted
green run.

Dependency decisions were bounded to compatible lines. Vitest moved from the
vulnerable 2.x line to 3.2.6 and resolved the Vite/esbuild advisories; Tailwind's
PostCSS integration moved to 4.3.3. Prisma remains at 6.12.0 because tested
6.19.1 pulled a currently vulnerable `@prisma/config` dependency chain. ESLint
is on the newest 9.x compatible with Next.js 15; npm now marks that major line
unsupported, so a separately tested Next.js/ESLint major upgrade remains due.

## Remaining risks and required controls

| Priority | Risk | Required control or next step |
|---|---|---|
| P1 | Multiple app processes can diverge because live registry, locks, and rate limits are local | Deploy exactly one replica. Design a shared coordination/rate-limit store before scaling. |
| P1 | SQLite availability and durability depend on the host filesystem | Use a persistent volume, stop writers for file-level backups, document restore drills, and monitor free space. |
| P1 | The Node.js 22 hosted workflow has not run yet | Require the new `Quality` workflow to pass before release. |
| P2 | Existing databases still require an exclusive upgrade window and verified backup | Stop all writers, back up the SQLite file, then use only the guarded `npm run db:migrate`; it rejects unknown or partial schema/history states. |
| P2 | Public source-address abuse controls are not implemented inside the app | Put shared IP/request limits at the reverse proxy or edge; the in-process global/account limits are a backstop, not a public perimeter. |
| P2 | Credential accounts do not verify email ownership | Treat email as an unverified sign-in identifier, or add a verified-email flow before relying on it for identity or recovery. |
| P2 | Auth.js is still a beta dependency | Track upstream changes and regression-test session/OAuth flows before each upgrade. |
| P2 | Rate limits reset on restart and do not aggregate across processes | Accept only for the single-process release; move counters to a shared store before public scale. |
| P2 | Schema-invalid socket packets are rejected before consuming the authenticated action budget | Add a small per-connection/account packet limiter before payload parsing if exposed to hostile public traffic. |
| P2 | Push delivery is best-effort and has no durable retry queue | Treat notifications as convenience only; gameplay must not depend on delivery. |
| P2 | Existing-subscription synchronization has no request deadline | Apply `AbortController` and a bounded timeout to the browser's synchronization request so a hung network cannot leave the control checking indefinitely. |
| P2 | Persisted game JSON is parsed without a versioned runtime schema | Add snapshot versioning, validation, and a quarantine/recovery path before long-lived format changes. |
| P2 | There is no automated two-browser end-to-end suite | Add create/join/play/reconnect/sign-out/push-permission browser coverage before broader traffic. |
| P2 | P2002 completion reconciliation is mock-simulated rather than raced through two real Prisma clients | Add an integration test using two clients against one temporary SQLite database. |
| P3 | Next.js 15 constrains ESLint to an upstream-unsupported 9.x line | Plan and test the Next.js 16/ESLint 10 migration rather than forcing the peer mismatch. |
| P3 | Other available dependency updates cross major-version boundaries | Upgrade Prisma, bcrypt, Zod, Vitest, and TypeScript in isolated compatibility changes with migration and regression evidence. |
| P3 | Operational telemetry is limited to application logs | Add structured request/socket error metrics, migration alerts, and basic health/readiness monitoring. |
| P3 | This public repository has no `LICENSE` file, so reuse rights are unspecified | Choose and add a license only if public reuse or contribution is intended; no license is selected by this review. |

## Release checklist

Before deploying:

1. Require a green `Quality` workflow on Node.js 22.
2. Provision one long-running application replica and a durable SQLite volume.
3. Configure HTTPS and preserve WebSocket upgrade headers at the proxy.
4. Generate a unique `AUTH_SECRET`; configure Google and VAPID values only as
   complete coherent sets; run `npm run env:check`.
5. Stop writers and back up any existing SQLite database. Run the guarded
   `npm run db:migrate`; do not manually resolve an unknown schema or migration
   history. Then run `npm run db:migrate:status`.
6. Build, prune development dependencies, and run the startup smoke test using
   the deployed environment.
7. Confirm database persistence across an application restart and test a real
   two-device match through completion.

Release approval should remain conditional until these environment-specific
checks are observed; repository-level gates cannot prove volume durability,
proxy behavior, OAuth callback registration, or real push delivery.
