# Player invitations, history, avatars and table changes

Implemented locally on top of `f810d48`. This document records implementation and
local verification; it does not certify deployment to the public service.

## Player workflows

- Search an existing player's registration/display name from the lobby, select
  the result and send an invitation. Names can repeat; results show an avatar
  and a short player identifier, without email or other account fields.
- The recipient accepts or declines from their lobby. The sender can cancel a
  pending invitation. Acceptance creates one match with both seats reserved;
  duplicate acceptance returns the same match. Pending invitations refresh while
  the lobby is visible, and accepted invitations link to the game.
- Create/join by eight-character invite code continues to work. Previously
  issued five-character codes remain supported.
- Profile shows lifetime wins, losses, pushes and match results. Head-to-head
  records and the opponent filter derive from stored games. History is paginated
  at 20 games. A manually ended/unfinished match does not create a match loss;
  games completed within that match still count.
- Eight preset avatars and custom JPEG/PNG/WebP uploads are account-backed.
  Uploads are limited to 2 MB and 16 megapixels, decoded as still raster images,
  center-cropped to 128×128 WebP, and stripped of metadata. Upload bytes stay in
  SQLite; public player objects and session cookies use a compact avatar URL.

## Table and card rendering

Each row has one continuous placement area with a row label. Only actual cards
are rendered inside it; unfilled positions no longer draw separate card outlines.
The central face-down deck displays `GameView.deckRemaining` from the server.
Drawing remains automatic; the count includes the effects of discards.

All ten card styles retain their face/back treatments and suit-color options.
Rank/suit indices use protected horizontal strips, with vector pips, court cues
or larger center labels between them. Font line boxes fit the visible fan peeks.

## Data and upgrade requirements

Run `npm run db:migrate` before starting the new version. The additive
`20260906000000_player_invitations` migration adds invitation storage and match
lookup indexes. It preserves existing users, matches, completed games and stats.
No production or existing user database was modified during this implementation.

The migration guard now recognizes both the prior and new tracked histories,
using the pre-feature schema fixture to validate old databases before upgrading.
Migration SQL is pinned to LF in `.gitattributes`; the released atomic migration
still matches its committed SHA-256 checksum. Its SQL content was not changed.

## Verification

- Node 22: lint, TypeScript, all **159 tests**, Prisma schema validation and a
  production Next.js build passed.
- Nine new SQLite-backed tests cover invitation authorization, deduplication,
  accept retries, decline/cancel, transaction rollback, seat-correct history,
  push/unfinished-match handling, image normalization and body limits.
- Migration verification passed for a fresh database, a legacy db-push database,
  the exact previously accepted round-2 history, and rejection of orphaned data.
  A second startup against the fully migrated database also passed.
- Three independent browser accounts exercised search/invite/accept, reserved
  seats, a full 40-move game, persisted history, opponent filtering, preset and
  uploaded avatars, the original code flow, decline and cancel. No page-script
  errors were reported.
- Anonymous API access was rejected; search returned only public fields;
  self-invitations and disguised SVG uploads were rejected. Uploaded image bytes
  were absent from session responses.
- Against the compiled production CSS, **6,240 card renders** (52 cards × ten
  styles × four sizes × three viewport widths) had no detected clipping or text/
  artwork overlap. All ten actual settings previews were checked at 320px.
- Lobby/profile/table screenshots were inspected. Table widths of 320, 390 and
  768px and profile/lobby widths of 320 and 390px had no horizontal overflow.

Local-only browser scripts, screenshots and JSON audit results are in the ignored
`.Codex/qa` workspace. Verification used a separate SQLite fixture and local
listener; it made no changes to the live service.
