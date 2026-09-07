# Computer opponents

This document describes the three standard opponents. The fourth opponent,
**Wildcard Edge**, uses separate untracked exhibition rules, described in
[WILDCARD_EDGE.md](WILDCARD_EDGE.md). Fair-play and statistics statements below
apply to the standard opponents only.

Implemented locally on top of `7bcb385`. This record covers implementation and
local verification, not a production deployment.

## Player experience

The signed-in lobby now offers **Play the computer**, alongside username
invitations and invite-code matches. Choose an opponent before starting:

| Opponent | Challenge | Behavior |
|---|---|---|
| Analyst Edge | Relaxed | Unpredictable legal placements. |
| House Edge | Strategic | Builds combinations and protects its concealed hand; experiments on 12% of turns. |
| Counter Edge | Advanced | Combines hand-building with sampled outcomes against visible rows; considers tactical discards. |

The table identifies computer matches and shows when the opponent is thinking.
The computer takes turns automatically; **Next game** only requires the human
player's readiness. Leaving does not erase the match. Reopening restores its
persisted state and schedules a pending computer turn if necessary.

Completed computer games count in overall statistics, as disclosed in the lobby
and profile. Each named opponent has a stable identity for separate head-to-head
records and history filtering. Existing human multiplayer remains available.

## Fairness, persistence and operational boundaries

- The strategy receives only `GameView`, the same redacted view a player gets.
  It cannot read the opponent's concealed cards, actual remaining deck, seed,
  database or authentication data. All levels use the same legal game engine.
- Counter Edge samples 64 hypothetical completions from unseen cards. These
  estimates are not knowledge of future draws or guarantees of optimal play.
- Computer turns reuse the human move persistence path, including transactional
  game completion, statistics and in-memory rollback after a failed write.
- A single pending timer per match runs outside the serialized mutation queue;
  state is rechecked inside the queue before acting. Ending a match cancels its
  pending turn. Reconnection cannot create duplicate scheduled turns.
- Built-in identities cannot sign in or act through an interactive socket. They
  are excluded from human search and invitations. Creation uses the existing
  per-account match-creation limit and reserves both seats transactionally.
- No external AI service or new dependency is required. A signed-in account,
  server connection and the existing single-process deployment remain required;
  this is not an offline mode.

## Migration

Run `npm run db:migrate` before starting the new version. The additive migration
`20260907000000_computer_opponents` adds nullable, unique `User.computerLevel`.
Existing users remain human; computer identities are created on demand.

The guard recognizes the released four-migration history using the exact prior
schema fixture, as well as the new five-migration history and supported older
histories. Previously released migration SQL was not changed. Production should
be backed up with its application writer stopped before applying this update.

## Verification

- Node 22: all **188 tests**, lint, TypeScript, Prisma schema validation, guarded
  migration verification and the production Next.js build passed.
- Real SQLite/realtime tests cover reserved seats, named identities, cold-state
  resume at every level, duplicate scheduling, cancelled turns, failed-write
  rollback/retry, full game completion, exactly-once history and next-game lead.
- API tests cover authentication, invalid/oversized input, caller identity,
  rate-limit responses, exclusion from human search and public-only responses.
- Strategy tests exercise complete seeded games in both seats, legal moves,
  input immutability, hidden-state invariance and an exact late-game tactic.
- Migration checks cover fresh/repeated startup, the released four-migration
  database with existing users/invitations preserved, legacy db-push, the exact
  round-2 predecessor and rejection of orphaned foreign-key data.
- Browser tests played a complete game at all three levels, used a human
  discard, reloaded midgame, started the next game, ended matches, filtered
  history and completed/reopened a target-one match without duplicate stats.
  Human code joining and username invitations/acceptance also passed.
- Picker/table widths 320, 390 and 1024px and profile widths 320 and 390px had
  no horizontal overflow. Screenshots were inspected; no page-script errors
  were reported. All browser work used an isolated local SQLite fixture.

After calibration, a separate 240-game deterministic comparison used unseen
test deals (seeds 8001–8040, both seat assignments per pairing):

| Pairing | First opponent wins | Second opponent wins | Pushes |
|---|---:|---:|---:|
| House Edge / Analyst Edge | 78 | 2 | 0 |
| Counter Edge / Analyst Edge | 80 | 0 | 0 |
| Counter Edge / House Edge | 56 | 24 | 0 |

The longest individual decision in that local run was under 9ms. These are
bounded bot-versus-bot checks, not promised human win rates or a universal
performance guarantee. The initial Cardfather strategy underperformed the
middle level; combining hand-building with its sampled estimates and allowing
the middle opponent occasional experimentation produced the final progression.

Local scripts and evidence are ignored under `.Codex/qa-computer/` and
`.Codex/computer-benchmark.ts`. No live database or production container was
modified for this feature implementation.
