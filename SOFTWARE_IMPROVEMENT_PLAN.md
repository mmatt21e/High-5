# Software Improvement Plan

Project: **Five-O Poker** (repository `High-5`)
Assessment date: 2026-07-23
Assessment method: full source review, production + development runtime testing (two simultaneous browser sessions via Playwright, full game played to showdown), build/test/typecheck validation. No source files were modified; this document is the only file created.

---

## 1. Executive Summary

**Overall project condition.** This is a small, well-organized Next.js 15 + Socket.IO application with an unusually clean core: the game engine (`src/lib/game`) is pure, deterministic, fully unit-tested (28 passing tests), and correctly redacts hidden information server-side. TypeScript strict mode passes, and the production build succeeds with no errors.

**UI and usability condition.** The mobile-first UI is visually consistent and attractive — a coherent felt-green/gold theme, reusable `.btn-*`/`.field`/`.panel` classes, good tap targets, clear turn indicators, and a genuinely readable card-fanning layout. Runtime review of every screen found only a handful of concrete problems: a translucent Settings modal that is hard to read over the board, an error-handling path that replaces the whole game screen for transient errors, unlabeled scores on the match-over screen, and pinch-zoom disabled (accessibility).

**Code quality and reliability condition.** The code is readable and idiomatic. However, runtime testing uncovered **one critical defect that breaks the app's primary flow**: a guest who joins a game while the host is watching the waiting room is rejected ("You are not part of this game") and the host waits forever, because the in-memory match registry is never refreshed after the join API updates the database. Two further high-severity issues were confirmed: socket authentication fails completely when running the production build over plain HTTP (cookie-name mismatch), and any database error inside a socket handler becomes an unhandled promise rejection that can crash the whole server.

**Are improvements required?** Yes — the four Priority 0 items are required (the app's core two-player flow does not currently work in a realistic deployment). The remainder are recommended (P1) or optional (P2/P3).

**Most important findings.**
- BUG-001 (Critical): stale in-memory match cache blocks guests from joining — reproduced at runtime.
- BUG-002 (High): production socket auth rejects every connection when `AUTH_URL` is HTTP — reproduced at runtime.
- REL-001 (High): unhandled promise rejections in socket handlers can crash the server process.
- BUG-003 (High): a transient move rejection or socket error permanently replaces the game screen with a full-screen error.

**Expected benefits.** After P0+P1: the core create→join→play→resume flow works reliably; the server cannot be crashed by a failed DB write; errors surface as recoverable messages instead of dead ends; the UI reaches a consistent, professional finish; linting exists; and the realtime layer gains regression tests.

**Areas not evaluated.**
- Google OAuth sign-in (no credentials available in the assessment environment).
- Web-push notifications end-to-end (no VAPID keys; headless browser has no push service). Code paths were reviewed statically.
- PostgreSQL deployment (assessed on SQLite; schema is portable by design).
- True mobile-device behavior (assessed with an emulated 390×844 touch viewport at DPR 2).
- `npm run lint` could not be executed: no ESLint config exists and the command drops into an interactive setup prompt (see VAL table and CODE-003).

---

## 2. Improvement Objectives

- Create a clean and professional interface (largely achieved today; close the remaining gaps).
- Make all screens visually consistent (fix the Settings modal surface; keep the existing design language).
- Make normal workflows self-explanatory (name the opponent and label scores on result screens).
- Reduce unnecessary user steps (auto-recover from transient errors instead of dead-ending).
- Prevent common user mistakes (keep the existing double-tap/turn guards; add cancel/abandon for stale games).
- Correct confirmed errors (BUG-001 … BUG-007).
- Improve error handling and diagnostics (REL-001, REL-004, server-side logging on failures).
- Make code readable and manageable (remove dead code, unused imports, add ESLint).
- Simplify unnecessarily complex code (nothing significant found — keep it that way).
- Preserve existing working behavior (the engine, scoring, redaction, and persistence design are correct; do not redesign them).
- Avoid unnecessary dependencies and abstractions (no new runtime dependencies are required by this plan; ESLint is dev-only).

---

## 3. Project Overview

- **Purpose:** a mobile-first web app for *Five-O Poker*, a heads-up poker variant. Two players on two devices each build four face-up rows plus one concealed hand from a shared 52-card deck; hands are compared 1-to-1 at showdown; matches are first-to-N game wins with lifetime stats.
- **Intended users:** two casual players (friends) playing on phones, possibly asynchronously (close the app, come back on your turn, optional push notification).
- **Primary workflows:**
  1. Register / sign in → home.
  2. Create a game → share 5-character invite code → opponent joins → play alternating turns → showdown → next game → match completion.
  3. Resume: reopen app → "Your games" list on home → tap game → continue.
  4. Review stats on the profile page; learn rules on "How to play".
- **Technology stack:** Next.js 15 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS v4; Socket.IO 4 on a custom Node server (`server.ts`, run via `tsx`); Auth.js (next-auth v5 beta) with credentials + optional Google; Prisma 6 (SQLite dev / Postgres prod); `web-push` for turn notifications; Vitest for tests; PWA via hand-written `public/sw.js`.
- **Target runtime:** long-running Node process (WebSockets required); deploys to Railway/Render/Fly-style hosts, not serverless.
- **Major components:**
  - `src/lib/game/` — pure engine: `cards.ts` (deck/shuffle/seeded RNG), `evaluator.ts` (5-card evaluation + kickers), `engine.ts` (state machine + per-seat redaction via `viewFor`), `types.ts`.
  - `src/server/gameManager.ts` — in-memory `LiveMatch` registry keyed by match id, socket event handlers (`handleJoin`, `handlePlace`, `handleDiscard`, `handleNext`, `handleEndMatch`, `handleDisconnect`), DB persistence (`saveState`, `persistAndScore`), stats (`applyGameStats`, `applyMatchStats`), turn push (`maybeNotifyTurn`).
  - `src/server/socketAuth.ts` — decodes the Auth.js JWT from the raw cookie header for socket handshakes.
  - `src/lib/realtime/events.ts` — shared typed Socket.IO event contracts; `SOCKET_PATH = "/api/socket"`.
  - `src/lib/match.ts` — invite-code generation, `createMatch`, `joinMatch` (DB only).
  - `src/auth.ts` — Auth.js config (JWT sessions, `uid`/`displayName` on token).
  - `src/app/` — pages: `/` (home/lobby), `/login`, `/register`, `/play/[code]`, `/profile`, `/how-to-play`; API routes: `/api/auth/register`, `/api/match`, `/api/match/join`, `/api/push/(un)subscribe`, `/api/auth/[...nextauth]`.
  - `src/components/` — `GameRoom.tsx` (all in-game screens), `Lobby.tsx`, `PlayingCard.tsx` (`CardFace`/`CardBack`/`EmptySlot`/`CardSlot`/`FannedColumn`), `useGameSocket.ts`, `DeckToggle.tsx`, `NotificationToggle.tsx`, `SignOutButton.tsx`, `ServiceWorker.tsx`.
- **Important entry points:** `server.ts` (HTTP + Socket.IO bootstrap); `src/app/layout.tsx` (root layout, deck-theme inline script); `src/components/GameRoom.tsx` (all play-time UI states).
- **Build and test commands:** `npm run dev` (tsx watch), `npm run build` (`prisma generate && next build`), `npm run start`, `npm test` (Vitest), `npm run db:push`, `npm run lint` (currently broken — no ESLint config).
- **Deployment method:** per README — Postgres provider switch in `prisma/schema.prisma`, env vars (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, optional Google + VAPID), `npm run build` + `npm run start` on a WebSocket-capable host.
- **Repository-specific conventions:** no CLAUDE.md / AGENTS.md / CONTRIBUTING / EditorConfig exist (`.gitignore` intentionally excludes AI-assistant files). Conventions observed from code: TypeScript strict; `@/*` path alias; Tailwind utility classes with a small set of shared component classes in `globals.css`; comments explain *why*; server-authoritative game logic; JSON-string persistence for cross-DB portability.

**Known deliberate limitation (do not "fix" without a decision):** in-progress game state is persisted to `Match.gameState` on every move, so games survive restarts by design; only the socket rooms and `ready` sets are memory-only.

---

## 4. Existing UI Inventory

| UI ID | Screen or component | Purpose | Primary users | Current style | Main concerns |
|---|---|---|---|---|---|
| UI-001 | Login (`/login`) | Sign in (credentials, optional Google) | All | Consistent (felt/gold, `.field`/`.btn-primary`) | None significant |
| UI-002 | Register (`/register`) | Create account | New users | Consistent | Stuck "Creating…" on network failure (BUG-005) |
| UI-003 | Home / Lobby (`/`) | Hub: active games list, create/join, stats summary, deck & notification settings | All | Consistent, clean | Join error message is generic-positioned; no way to remove stale lobby games (UX-009) |
| UI-004 | Waiting room (in `GameRoom`) | Show invite code, share, wait for guest | Host | Consistent, excellent code display | Host never learns the guest joined (BUG-001); "Cancel" just navigates away, match stays open (UX-009) |
| UI-005 | Game table (in `GameRoom`) | Core play screen: opponent board, turn banner, your rows, hidden hand | Both players | Consistent; fits one 390×844 screen with no scrolling | Tiny 8–9px labels (UI-008); no aria labels (A11Y-001) |
| UI-006 | Settings modal (in `GameRoom`) | Deck toggle, notifications, rules link, end match | Both players | **Translucent panel — board bleeds through** | UI-101 (readability); destructive "End match" only guarded by `window.confirm` |
| UI-007 | Showdown / Game-over (in `GameRoom`) | Reveal boards, per-hand results, next-game ready flow | Both players | Consistent; green win rings read well | "Opponent won the game" doesn't name the opponent; hand labels 9px (UX-102) |
| UI-008 | Match-over (in `GameRoom`) | Final result + back to lobby | Both players | Consistent | "Final score 0 – 1" unlabeled (whose is whose); early-ended match shows loser-pink "Match over" for both (UX-102, REL-005) |
| UI-009 | Full-screen error (in `GameRoom`) | Join/connection errors | Both players | Minimal | Also triggered by *transient* move errors, killing the game view (BUG-003) |
| UI-010 | Loading states (in `GameRoom`) | "Connecting…", "Joining game…", "Dealing the cards…" | Both players | Consistent spinner | Can hang on "Connecting…" with no retry affordance (REL-004) |
| UI-011 | Profile (`/profile`) | Full lifetime stats, deck toggle | All | Consistent grid of stat cells | None significant |
| UI-012 | How to play (`/how-to-play`) | Rules with live card examples | New users | Consistent, clear | None |
| UI-013 | Card components (`PlayingCard.tsx`) | Card faces/backs/slots, fanned columns | All | Reusable, three sizes, deck-color theming | None — good |
| UI-014 | Turn badge / player bars | Score dots, "(you)", turn chips on home | All | Consistent | None |

---

## 5. Proposed UI Design Standards

The app already has a de-facto design system. Codify it (as a short comment block in `globals.css`, not a new framework) and fix the deviations:

- **Typography:** system font stack (as now). Sizes: page titles `text-2xl font-black text-gold`; section headers `font-bold` base size; body `text-sm`; secondary `text-xs text-white/60`; **minimum informational text size 10px** — replace the current `text-[8px]`/`text-[9px]` labels with `text-[10px]` (UI-008).
- **Color palette (keep):** `--color-felt-900/800/700` greens, `--color-gold #e8c46a`, `--color-card #f7f5ef`; success = emerald-300/400, danger = rose-300/400, muted = `white/60`. Card suit colors via `.suit-*` + `data-deck` theming (keep).
- **Spacing:** page padding `p-6` (menus) / `p-3` (game table); vertical rhythm `gap-6` (menus) / `gap-2` (table); panels `p-4`.
- **Control sizes:** buttons and fields min-height 48px (`.btn*`, `.field` — keep); small in-game chip buttons ≥ 32px tap height.
- **Button hierarchy:** `.btn-primary` (gold) = single main action per screen; `.btn-ghost` = secondary; `.btn-outline` = alternate action; danger = rose outline style (as End match / Discard). Never two `.btn-primary` on one screen.
- **Input layouts:** stacked `.field`s with placeholder labels (current pattern) are acceptable at this scale; inline validation message in `text-sm text-rose-400` directly beneath the failing form.
- **Dialog standard (new — the fix for UI-101):** overlay `bg-black/60`; sheet `rounded-2xl border border-white/10 bg-felt-800 p-4 shadow-xl` (opaque surface, NOT `.panel`); title `text-lg font-black text-gold`; close ✕ top-right with `aria-label`; destructive actions at the bottom in danger style with confirmation.
- **Data-grid appearance:** stat cells `rounded-xl bg-white/5 p-4 text-center` (as profile — keep).
- **Status presentation:** turn state = gold banner (you) / dark banner (them) — keep; per-hand result = emerald ring + label for wins, 70% opacity for losses — keep; score dots + `n/target` — keep.
- **Error presentation:** full-screen error ONLY for fatal join failures (not a member, match gone, cannot connect after retries). Transient errors (illegal move, temporary disconnect) = inline toast/banner over the table that auto-dismisses, game view stays mounted (BUG-003).
- **Loading and empty states:** spinner + one short sentence (current pattern — keep); add a "Retry" button if still disconnected after ~10 s (REL-004).
- **Navigation behavior:** top bar in game = "← Leave" (never destroys the match), centered code, "⚙ Settings"; menu pages = title + "Back" link (keep).
- **Resizing and DPI:** max-width `max-w-md` centered column (keep); safe-area padding (keep); board must fit 390×844 without scroll (verified today — preserve).
- **Accessibility expectations:** restore pinch zoom (remove `maximumScale/userScalable` — iOS zoom-on-focus is already prevented by the 16px input font); `aria-label` on icon-only buttons, card buttons ("Place 6 of diamonds"), and row targets ("Row 2, 3 of 5 cards"); `aria-live="polite"` on the turn banner text.
- **Reusable controls:** `PlayingCard.tsx` components and the `.btn*/.field/.panel` classes are the component library — extend them rather than adding one-off styles.

---

## 6. Current Validation Results

All commands run from the repository root on Node v22.22.2 / npm 10.9.7, Linux.

| Validation | Exact command | Result | Relevant details |
|---|---|---|---|
| Dependency install | `npm ci` | ✅ Pass | No install errors |
| Unit tests | `npm test` | ✅ Pass | 2 files, 28/28 tests pass (engine + evaluator) |
| Prisma client | `npx prisma generate` | ✅ Pass | Generates v6.19.3 client |
| Type check | `npx tsc --noEmit` | ✅ Pass | Strict mode, zero errors |
| Production build | `npm run build` | ✅ Pass | Next 15.5.19; 13 routes; no warnings of note |
| Lint | `npx next lint` | ❌ Fail | No ESLint config exists; command enters an interactive setup prompt and `next lint` is deprecated in Next 16 (CODE-003). Environment-independent: the config genuinely is absent. |
| DB schema sync (temp) | `npm run db:push` (against a temporary `.env`, removed after testing) | ✅ Pass | SQLite schema created cleanly |
| Runtime, production mode | `npm run start` + two authenticated browser sessions | ❌ Fail | Every socket connection rejected → permanent "Could not connect" on all play screens. Root cause confirmed as BUG-002 (cookie-name mismatch when `NODE_ENV=production` + HTTP `AUTH_URL`), not the environment. |
| Runtime, dev mode | `npm run dev` + two authenticated browser sessions | ⚠️ Partial | Auth, lobby, create, waiting room, gameplay to showdown, settings, profile all work. **But** guest join while host's socket is connected fails (BUG-001, reproduced); recurring React hydration errors in console (BUG-004); `/favicon.ico` 404 (BUG-007); one transient hang on "Connecting…" resolved only by manual reload (REL-004). |

Temporary validation artifacts (`.env`, `prisma/dev.db`) were deleted after testing; `git status` is clean.

---

## 7. Findings Summary

| ID | Finding | Category | Evidence | Severity | Confidence | Recommendation |
|---|---|---|---|---|---|---|
| BUG-001 | Stale in-memory match cache blocks guest from joining; host waits forever | Confirmed defect | Runtime repro; `gameManager.ts` `getLive` returns cache without refresh; join API never touches registry | Critical | Confirmed | Refresh cached `LiveMatch` from the fresh DB row in `handleJoin` |
| BUG-002 | Socket auth rejects all connections in production over HTTP (cookie-name mismatch) | Confirmed defect | Runtime repro (prod build); `socketAuth.ts:11-16` vs Auth.js `useSecureCookies` (URL-protocol-based) | High | Confirmed | Derive cookie name from `AUTH_URL` protocol only |
| BUG-003 | Any `errorMsg` (e.g. illegal-move rejection) permanently replaces the whole game UI | Confirmed defect | `GameRoom.tsx:18-27` renders error-only view; `useGameSocket.ts:49` never clears it | High | Confirmed | Separate fatal vs transient errors; toast for transient |
| BUG-004 | React hydration error on every page (`data-deck` inline script on `<html>`) | Confirmed defect | Console errors captured on all pages; `layout.tsx:30-35` | Medium | Confirmed | `suppressHydrationWarning` on `<html>` |
| BUG-005 | Network failure during create/join/register leaves buttons stuck in busy state (no catch) | Confirmed defect | `Lobby.tsx:12-35`, `register/page.tsx:16-44` — `fetch` rejection unhandled | Medium | Confirmed | try/catch/finally around the fetches |
| BUG-006 | `Game.seed` always recorded as 0, defeating the replay/audit design | Confirmed defect | `gameManager.ts` `persistAndScore` → `seed: 0`; seed generated in `startGame` but discarded | Low | Confirmed | Keep seed on `LiveMatch`; store it |
| BUG-007 | `/favicon.ico` 404 | Confirmed defect | Browser console during runtime test | Low | Confirmed | Add `icons` metadata / favicon |
| REL-001 | DB error in a socket handler → unhandled rejection → potential server crash | Reliability risk | `server.ts:44-63` `void handleX(...)` with no catch; `applyMove` rethrows non-IllegalMoveError | High | High | Wrap handlers; add process-level rejection logging |
| REL-002 | Concurrent `getLive` for the same match can create two live objects; one overwrites the other | Reliability risk | `gameManager.ts:48-80` (async gap between cache check and `registry.set`) | Medium | High | Single-flight the load per match id |
| REL-003 | Game persistence + stats are multiple sequential writes with no transaction | Reliability risk | `persistAndScore` / `applyGameStats` | Medium | High | Wrap in `prisma.$transaction` |
| REL-004 | Client can hang on "Connecting…" with no retry affordance | Reliability risk | Observed once in runtime testing; `GameRoom.tsx:28-37` | Medium | Medium | Timeout → show retry button |
| REL-005 | Voluntarily ended matches: no winner, no match stats, loser-styled "Match over" for both | Reliability risk / UX | `handleEndMatch` sets complete without stats; observed profile shows Matches played 0 after ended match | Medium | Confirmed | Decide semantics; at minimum label the screen honestly |
| UI-101 | Settings modal surface is translucent; board bleeds through text | UI inconsistency | Screenshot; `GameRoom.tsx` `SettingsModal` uses `.panel` (`bg-black/20`) | High | Confirmed | Opaque dialog surface per design standard |
| UX-102 | Result screens don't name the opponent or label scores ("Opponent won the game", "Final score 0 – 1") | Usability problem | Screenshots of game-over/match-over | Medium | Confirmed | Use display names and "You x – y Name" |
| UX-103 | Pinch zoom disabled (`maximumScale: 1, userScalable: false`) | Accessibility problem | `layout.tsx:13-19` | Medium | Confirmed | Remove the restrictions |
| A11Y-104 | No aria-labels on card/row buttons; no live region for turn changes | Accessibility problem | `GameRoom.tsx` `YourHand`/`RowsBoard`/`TurnBanner` | Medium | High | Add labels + `aria-live` |
| UX-105 | No way to cancel/delete a created game; stale lobby matches accumulate on home; `"abandoned"` status never used | Usability problem | `match.ts`, waiting-room "Cancel" only navigates; schema comment lists `abandoned` | Medium | Confirmed | "Cancel game" action in waiting room |
| UI-106 | 8–9px text labels ("hidden", hand-result labels) | UI inconsistency | `GameRoom.tsx` `text-[8px]`/`text-[9px]` | Low | Confirmed | Raise to 10px minimum |
| UX-107 | Discard button states cryptic ("Discard ✓" when used; disabled without explanation) | Usability problem | `GameRoom.tsx` `YourHand` | Low | Confirmed | Clearer labels ("Discard used") |
| CODE-001 | Dead unreachable branch in `joinMatch` ("You can't join your own game") | Maintainability issue | `match.ts:44-50` — rejoin check returns first | Low | Confirmed | Reorder/remove |
| CODE-002 | Unused imports (`CardFace`, `Card` in `GameRoom.tsx`) | Maintainability issue | `GameRoom.tsx:8-10` | Low | Confirmed | Remove (ESLint will catch) |
| CODE-003 | No ESLint config; `npm run lint` broken/interactive; deprecated `next lint` | Testing gap | Validation table | Medium | Confirmed | Add flat ESLint config + script |
| CODE-004 | JWT callback queries the DB for `displayName` on every request | Performance issue | `auth.ts:67-77` | Low | Confirmed | Acceptable at this scale; note only / cache on token |
| CODE-005 | `DeckToggle` reads localStorage unguarded and briefly renders wrong selection | Maintainability issue | `DeckToggle.tsx:25-28` | Low | Confirmed | Guard + init from DOM attribute |
| SEC-001 | `allowDangerousEmailAccountLinking: true` on Google provider | Security issue | `auth.ts:31` | Informational | Confirmed | Acceptable (Google verifies email); document the choice |
| SEC-002 | No rate limiting on auth/join endpoints | Security issue | API routes | Low | High | Note only for this scale; optional hardening |
| TEST-001 | No tests for `gameManager`, `joinMatch`, or socket flows (the layer where all real bugs were found) | Testing gap | `src/lib/game/__tests__` only | Medium | Confirmed | Add Vitest coverage for match lifecycle |
| DOC-001 | README claims games are replayable/auditable from seed, contradicted by BUG-006; no CONTRIBUTING/lint docs | Documentation gap | README vs `persistAndScore` | Low | Confirmed | Fix alongside BUG-006 |

---

## 8. Detailed Findings

### BUG-001 — Guests cannot join a game while the host is in the waiting room *(the core flow)*
- **Classification:** Confirmed defect. **Severity:** Critical. **Confidence:** Confirmed (reproduced twice at runtime).
- **Evidence:** With the host's browser on the waiting-room screen and a second user joining via the UI: guest's play screen shows full-screen "You are not part of this game"; host remains on "Waiting for your opponent…" indefinitely, even though `POST /api/match/join` returned 200 and the DB row has `guestId` set and `status = "active"`.
- **Affected files/symbols:** `src/server/gameManager.ts` — `getLive`, `handleJoin`, `registry`; `src/lib/match.ts` — `joinMatch`.
- **Current behavior:** When the host opens `/play/<code>`, `handleJoin` → `getLive(matchId)` loads the match from the DB **with `guest: null`** and caches it in the module-level `registry`. `joinMatch` (called from the `/api/match/join` route) updates only the database. When the guest's socket then joins, `handleJoin` fetches the fresh DB row (which has the guest) but immediately calls `getLive(match.id)`, which returns the **stale cached** object; `seatOfUser` returns -1 → "You are not part of this game". The auto-start block never runs because `live.guest` is null. Nothing ever invalidates the cache, so the match is permanently wedged (until a server restart clears the registry).
- **Desired behavior:** Guest joins; both clients immediately receive a snapshot with both seats; game 1 auto-starts.
- **Why it matters:** This is the app's primary happy path. The host is essentially always on the waiting-room screen (that's where the invite code is displayed), so real two-device play is broken.
- **Recommended correction (simplest):** `handleJoin` already holds the fresh DB row `m`. After `getLive`, reconcile the cached object:
  ```ts
  // in handleJoin, after `const live = await getLive(match.id)`:
  if (!live.guest && match.guestId) {
    const guest = await prisma.user.findUnique({ where: { id: match.guestId } });
    if (guest) {
      live.guest = { userId: guest.id, displayName: guest.displayName };
      live.status = match.status as LiveMatch["status"];
    }
  }
  ```
  (Alternatively pass the already-included `guest` relation by using `include: { guest: true }` in `handleJoin`'s own query to avoid the second lookup.)
- **Alternatives considered:** (a) delete the registry entry in the join API route — crosses the API/socket module boundary and Next bundling can duplicate module instances (the code already works around this with `globalThis`), so it's fragile; (b) always reload from DB in `getLive` — loses in-flight `ready` state and adds a read per event. The in-place reconcile is smallest and safest.
- **Compatibility/regression risks:** Minimal — only fills a previously-null seat. Must not overwrite an existing `live.guest`.
- **Required tests:** New `gameManager` test: host socket joins (cache created) → DB join happens → guest socket joins → both receive snapshots with both seats and a game view (see TEST-001/T-013).
- **Effort:** Small. **Status:** Required.

### BUG-002 — Production socket auth fails over HTTP (cookie-name mismatch)
- **Classification:** Confirmed defect. **Severity:** High. **Confidence:** Confirmed (reproduced with `npm run start`; identical flow works in dev mode).
- **Evidence:** Production run: every play-screen session shows "Could not connect"; sockets never authenticate. `src/server/socketAuth.ts:11-16` computes `secure = NODE_ENV === "production" || AUTH_URL.startsWith("https")` and then looks for the `__Secure-authjs.session-token` cookie. Auth.js itself decides secure-cookie usage from the **URL protocol** (http → sets plain `authjs.session-token`). With `NODE_ENV=production` and an `http://` `AUTH_URL` (local prod testing, LAN play, or any deployment behind TLS-terminating proxies that present http internally without `AUTH_URL` set to https), the names disagree and `getToken` finds nothing → every socket rejected as Unauthorized.
- **Affected files/symbols:** `src/server/socketAuth.ts` — `userIdFromCookie`.
- **Current behavior:** `io.use` middleware rejects all handshakes in that configuration; client shows permanent "Could not connect" (compounded by BUG-003's full-screen treatment).
- **Desired behavior:** Socket auth accepts the same session cookie the web app sets, in every environment.
- **Recommended correction (simplest):** match Auth.js's own logic — and be tolerant of both names:
  ```ts
  const secure = (process.env.AUTH_URL ?? "").startsWith("https");
  const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  ```
  Optionally, if the first lookup returns null, retry once with the other name (2 lines) so the server works regardless of proxy/env skew.
- **Alternatives considered:** documenting "always set https AUTH_URL" — doesn't help local production verification and leaves a silent failure mode.
- **Compatibility/regression risks:** None for correctly-configured HTTPS deployments (condition unchanged there).
- **Required tests:** Unit test `userIdFromCookie` with a token sealed under each cookie name (see T-013); manual: `npm run start` with http AUTH_URL → sockets connect.
- **Effort:** Small. **Status:** Required.

### BUG-003 — Transient errors permanently replace the game screen
- **Classification:** Confirmed defect (error handling). **Severity:** High. **Confidence:** Confirmed.
- **Evidence:** `useGameSocket.ts:49` — `socket.on("errorMsg", ({ message }) => setError(message))`; `GameRoom.tsx:18-27` — any non-null `error` renders *only* an error message + "Back to lobby", unmounting the table. The server sends `errorMsg` for routine rejections (`IllegalMoveError`: "Not your turn", "That row is already full" — `gameManager.ts:349-352`). A double-tap race or a stale view therefore kicks the player off the board mid-game; the error is never cleared except by a reconnect.
- **Affected files/symbols:** `src/components/useGameSocket.ts` (`error` state), `src/components/GameRoom.tsx` (top-of-function error branch), `src/lib/realtime/events.ts` (`errorMsg`).
- **Current behavior:** One transient rejection → dead-end screen; state recovers only via manual navigation/reload.
- **Desired behavior:** Fatal join errors ("Game not found", "You are not part of this game") keep the full-screen treatment. Transient errors show as a small dismissible banner/toast over the table for ~3 s; the board stays mounted (the next `game:view` broadcast already restores correct state).
- **Recommended correction (simplest):** split the state in `useGameSocket` into `fatalError` (set only before the first snapshot arrives, or for the two membership errors) and `notice` (everything after); auto-clear `notice` with a timeout. `GameRoom` renders the full-screen branch only for `fatalError` and a toast for `notice`. No server changes; optionally add a `fatal?: boolean` flag to the `errorMsg` payload for explicitness.
- **Alternatives considered:** suppressing `errorMsg` entirely (loses useful feedback); server-side distinction via separate events (fine, slightly larger contract change).
- **Compatibility/regression risks:** Low; the fatal paths must be preserved (guest-of-another-match, deleted match).
- **Required tests:** Component-level test is optional; minimum manual check: two rapid taps on a row → banner appears, board remains; wrong-turn packet (drive socket directly) → same.
- **Effort:** Small–Medium. **Status:** Required.

### BUG-004 — Hydration mismatch on every page (`data-deck` script)
- **Classification:** Confirmed defect. **Severity:** Medium (React recovers, but it logs errors on every load, risks subtle attribute loss, and pollutes diagnostics). **Confidence:** Confirmed (console captured on multiple pages, both sessions).
- **Evidence:** "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties…" on every navigation; `src/app/layout.tsx:30-35` injects `document.documentElement.setAttribute('data-deck', …)` before hydration while the server-rendered `<html>` has no `data-deck`.
- **Recommended correction (simplest):** `<html lang="en" suppressHydrationWarning>` — the standard pattern for pre-paint theme attributes. One attribute; no behavior change.
- **Affected files/symbols:** `src/app/layout.tsx` `RootLayout`.
- **Required tests:** Manual — console clean on `/`, `/login`, `/play/<code>`.
- **Effort:** Small. **Status:** Recommended (P1).

### BUG-005 — Unhandled fetch failures leave forms stuck busy
- **Classification:** Confirmed defect. **Severity:** Medium. **Confidence:** Confirmed (code path; deterministic when offline).
- **Evidence:** `src/components/Lobby.tsx` `createGame`/`joinGame` and `src/app/register/page.tsx` `onSubmit` call `fetch` with no try/catch. If the network drops, the promise rejects: the button stays disabled at "Creating…/Joining…/Creating…" forever and the rejection is unhandled. (The PWA's offline shell makes an offline app-open realistic.)
- **Recommended correction (simplest):** wrap each in `try { … } catch { setError("Network error — check your connection and try again") } finally { setBusy(null) / setLoading(false) }`.
- **Affected files/symbols:** `Lobby.tsx` (`createGame`, `joinGame`), `register/page.tsx` (`onSubmit`); `GameRoom.tsx` `WaitingRoom.share` has the same shape (clipboard API may be unavailable) — add a fallback that just shows the code is selectable.
- **Required tests:** Manual with DevTools offline mode: each action shows an error and re-enables.
- **Effort:** Small. **Status:** Recommended (P1).

### BUG-006 — Game seed recorded as 0
- **Classification:** Confirmed defect. **Severity:** Low. **Confidence:** Confirmed.
- **Evidence:** `gameManager.ts` `startGame` generates `const seed = Math.floor(Math.random() * 0x7fffffff)` and passes it to `createGame`, but does not store it; `persistAndScore` writes `seed: 0` for every `Game` row. `cards.ts` documents the seed's purpose: "a game can be replayed/audited from its seed". README repeats this.
- **Recommended correction (simplest):** add `gameSeed: number | null` to `LiveMatch`, set it in `startGame`, write it in `persistAndScore`. (Persist it in `Match.gameState` restoration path too — the serialized `GameState` doesn't contain the seed, so also include it when saving `gameState`, e.g. store `{ seed, state }` or add a `gameSeed` column; simplest acceptable: only track it in memory and store 0 after a restart-resume, documenting that limitation — decide per §16 D3.)
- **Affected files/symbols:** `gameManager.ts` (`LiveMatch`, `startGame`, `persistAndScore`), optionally `prisma/schema.prisma` (`Match`).
- **Effort:** Small. **Status:** Recommended (P1, pairs with DOC-001).

### BUG-007 — favicon 404
- **Classification:** Confirmed defect. **Severity:** Low. **Confidence:** Confirmed (console).
- **Evidence:** Browsers request `/favicon.ico`; only `public/icon.svg` exists and metadata doesn't declare icons.
- **Recommended correction:** add `icons: { icon: "/icon.svg" }` to `metadata` in `layout.tsx` (and optionally a small `favicon.ico` in `public/`).
- **Effort:** Small. **Status:** Recommended (P1, trivial).

### REL-001 — Socket handlers can crash the server via unhandled rejections
- **Classification:** Reliability risk. **Severity:** High. **Confidence:** High (code-confirmed path; not runtime-triggered).
- **Evidence:** `server.ts:44-63` invokes every handler as `void handleJoin(...)` etc. `applyMove` catches only `IllegalMoveError` and rethrows everything else (`gameManager.ts:346-354`); `persistAndScore`, `saveState`, `applyGameStats` perform multiple awaited Prisma calls. Any DB hiccup (locked SQLite file, dropped Postgres connection, missing `Stats` row) becomes an unhandled promise rejection. On Node ≥15 the default behavior is process termination — one bad write kills every live game.
- **Desired behavior:** A failed handler logs the error, optionally emits `errorMsg` ("Something went wrong — please retry"), and the server keeps running.
- **Recommended correction (simplest):** one wrapper in `server.ts`:
  ```ts
  const safe = (fn: () => Promise<void>) =>
    fn().catch((err) => console.error("socket handler error:", err));
  // usage: socket.on("game:place", (p) => safe(() => handlePlace(io, socket, p.cardId, p.row)));
  ```
  plus `process.on("unhandledRejection", (err) => console.error(err))` as a belt-and-braces backstop (log, don't exit).
- **Alternatives considered:** try/catch inside each handler in `gameManager.ts` — more edits, same effect; fine either way.
- **Required tests:** Unit: a handler whose Prisma call rejects does not propagate (mock). Manual: delete the DB file mid-game in dev; server logs but survives.
- **Effort:** Small. **Status:** Required.

### REL-002 — `getLive` load race can drop state
- **Classification:** Reliability risk. **Severity:** Medium. **Confidence:** High (code-confirmed; low probability window).
- **Evidence:** `gameManager.ts:48-80`: cache check, then `await prisma.match.findUnique(...)`, then `registry.set`. Two sockets joining the same match concurrently (typical: both players reconnect after a restart) can both miss the cache; the second `registry.set` replaces the first object, discarding any mutation applied to it in between (e.g. a `ready` flag or an in-progress move applied to the first instance).
- **Recommended correction (simplest):** memoize the in-flight promise:
  ```ts
  const loading = new Map<string, Promise<LiveMatch | null>>();
  async function getLive(matchId: string) {
    const cached = registry.get(matchId);
    if (cached) return cached;
    let p = loading.get(matchId);
    if (!p) { p = loadLive(matchId).finally(() => loading.delete(matchId)); loading.set(matchId, p); }
    return p;
  }
  ```
- **Required tests:** Unit: two concurrent `getLive` calls resolve to the same object instance.
- **Effort:** Small. **Status:** Recommended (P2).

### REL-003 — Non-transactional persistence of results and stats
- **Classification:** Reliability risk. **Severity:** Medium. **Confidence:** High.
- **Evidence:** `persistAndScore` → `prisma.game.create`, then `applyGameStats` (up to three separate updates), then possibly `applyMatchStats`, then `saveState` — sequential, no `$transaction`. A crash or error mid-sequence leaves a recorded game without stats, or stats without the match score, permanently skewing lifetime stats.
- **Recommended correction:** collect the writes into a single `prisma.$transaction([...])` (interactive transaction for the streak read-then-write, or restructure best-streak as `bestStreak = max(bestStreak, currentStreak + 1)` computed from the pre-read value inside the transaction).
- **Affected symbols:** `persistAndScore`, `applyGameStats`, `applyMatchStats`, `saveState`.
- **Compatibility risks:** None functional; keep the same final values. SQLite supports these transactions fine.
- **Required tests:** gameManager test: simulated failure of the stats write leaves no orphan `Game` row.
- **Effort:** Medium. **Status:** Recommended (P2).

### REL-004 — "Connecting…" can hang with no recovery affordance
- **Classification:** Reliability risk / UX. **Severity:** Medium. **Confidence:** Medium (observed once in dev; exact root cause not isolated; Socket.IO auto-reconnect normally recovers).
- **Evidence:** During runtime testing one authenticated client sat on "Connecting…" for >30 s; a page reload fixed it immediately.
- **Recommended correction (simplest, validates the concern per operating rule): add a visible escape hatch rather than chasing the root cause first** — in `GameRoom`, if `!snapshot` for more than ~8 s, show "Still connecting… **Retry**" where Retry tears down and recreates the socket (or `location.reload()`). Log `connect_error` reasons (`socket.on("connect_error", (e) => console.warn(e.message))`) to gather data.
- **Effort:** Small. **Status:** Recommended (P2).

### REL-005 — Early-ended matches: no winner, no stats, misleading screen
- **Classification:** Reliability risk / usability. **Severity:** Medium. **Confidence:** Confirmed (observed: after "End match", winner's profile shows Matches played 0 / Match wins 0).
- **Evidence:** `handleEndMatch` sets `status = "complete"` with `matchWinnerId` still null and never calls `applyMatchStats`. `MatchOver` styles the null-winner case with the loser's pink "Match over" for **both** players and an unlabeled "Final score 0 – 1".
- **Desired behavior (decision D2 in §16, recommended default):** an early end is recorded as an *ended* match with no winner: `matchesPlayed` increments for both, no `matchWins`; the screen says "Match ended — final score You x – y NAME" in neutral styling for both players.
- **Affected symbols:** `handleEndMatch`, `applyMatchStats`, `MatchOver` in `GameRoom.tsx`.
- **Effort:** Small–Medium. **Status:** Recommended (P1 for the screen wording; P2 for the stats semantics).

### UI-101 — Settings modal is translucent and hard to read
- **Classification:** UI inconsistency. **Severity:** High (it's the only screen that reads as broken). **Confidence:** Confirmed (screenshot).
- **Evidence:** `SettingsModal` uses `className="panel …"`; `.panel` = `bg-black/20` (20% opaque). Cards, the Discard button, and board text show through the sheet; the "End match" button visually collides with the underlying "Discard" button.
- **Current appearance:** semi-transparent sheet over the live board. **Proposed appearance:** same layout on an opaque `bg-felt-800` sheet with border and shadow (per §5 dialog standard).
- **Controls to change:** the modal container class only — replace `panel` with the dialog surface classes; no structural change.
- **How the user knows it worked:** modal text is fully legible over any board state.
- **Effort:** Small. **Status:** Required (P1).

### UX-102 — Unnamed opponent and unlabeled scores on result screens
- **Classification:** Usability problem. **Severity:** Medium. **Confidence:** Confirmed (screenshots).
- **Evidence:** Game over: "Opponent won the game", "Hands won — you 2 · opponent 3" (the opponent's name — already displayed at the top of the same screen — is not used). Match over: "Final score 0 – 1" is host–guest order, which the guest has no way to interpret.
- **Proposed:** "**Bob** won this game", "Hands won — you 2 · Bob 3"; match over: "Final score: You 0 – 1 Bob"; early-end wording per REL-005. Data is already present in `snapshot`/`view` — presentation-only change in `GameOver`/`MatchOver`.
- **Effort:** Small. **Status:** Recommended (P1).

### UX-103 — Pinch zoom disabled
- **Classification:** Accessibility problem (WCAG 1.4.4). **Severity:** Medium. **Confidence:** Confirmed.
- **Evidence:** `layout.tsx` viewport: `maximumScale: 1, userScalable: false`. Low-vision users cannot zoom the board or rules. iOS input auto-zoom (the usual reason for this hack) is already prevented by the global 16px input font-size (`globals.css:36-40`).
- **Recommended correction:** remove `maximumScale` and `userScalable` from the viewport export.
- **Regression risk:** double-tap zoom during play; mitigate with CSS `touch-action: manipulation` on buttons (one line on `.btn`/card buttons) instead of viewport lockdown.
- **Effort:** Small. **Status:** Recommended (P1).

### A11Y-104 — Missing accessible names and announcements in the game
- **Classification:** Accessibility problem. **Severity:** Medium. **Confidence:** High.
- **Evidence:** `YourHand` card buttons contain only visual card faces (rank/suit text is present but reads as e.g. "6 ♦ ♦"); `RowsBoard` row buttons have no label at all when empty; turn changes are visual only.
- **Recommended corrections:** `aria-label={\`\${RANK_LABEL[rank]} of \${suitName}\`}` on card buttons (add a `SUIT_NAME` map next to `SUIT_LABEL` in `cards.ts`); `aria-label={\`Place into row \${i + 1}\`}` on row buttons; `aria-pressed={isSel}` on hand cards; wrap the `TurnBanner` headline in `aria-live="polite"`; `aria-label="Settings"` on the gear button.
- **Effort:** Small–Medium. **Status:** Recommended (P2).

### UX-105 — No way to cancel a created game; stale matches accumulate
- **Classification:** Usability problem. **Severity:** Medium. **Confidence:** Confirmed.
- **Evidence:** Waiting room "Cancel" is a plain link home; the lobby match persists and reappears under "Your games" forever ("Waiting" badge). The schema documents an `"abandoned"` status that nothing sets.
- **Proposed workflow:** waiting room gains a "Cancel game" action (only while `status === "lobby"`): sets `status = "abandoned"`, removes the registry entry, navigates home. `joinMatch` already rejects abandoned matches. Home list query already filters to `lobby|active`, so cancelled games disappear.
- **Controls:** replace the "Cancel" link with a ghost-style button + confirm; add a `match:cancel` socket event or a small `DELETE`-semantics API route (either is consistent; socket event recommended since the waiting room is already socket-connected).
- **Effort:** Medium. **Status:** Recommended (P1).

### UI-106 — Sub-10px text
- **Classification:** UI inconsistency. **Severity:** Low. **Confidence:** Confirmed.
- **Evidence:** `text-[8px]` ("hidden" label under the opponent's concealed stack), `text-[9px]` (hand-result labels on `ResultBoard`).
- **Recommended:** raise both to `text-[10px]`; verified today that the 5-column showdown grid has vertical room for it.
- **Effort:** Small. **Status:** Recommended (P2).

### UX-107 — Discard control states unclear
- **Classification:** Usability problem. **Severity:** Low. **Confidence:** Confirmed.
- **Evidence:** Button reads "Discard ✓" after use (ambiguous — looks affirmative); when disabled pre-selection there's no cue that selecting a card enables it.
- **Recommended:** label "Discard" normally, "Discard used" (or strikethrough) once spent; keep disabled-until-selected but add the hint text already present in `TurnBanner` mentioning discard only while it's available.
- **Effort:** Small. **Status:** Optional (P3).

### CODE-001 — Dead branch in `joinMatch`
- **Classification:** Maintainability issue. **Severity:** Low. **Confidence:** Confirmed.
- **Evidence:** `match.ts:44-50` — the participant-rejoin check (`match.hostId === userId || match.guestId === userId → ok`) precedes `if (match.hostId === userId) return "You can't join your own game"`, making the latter unreachable.
- **Recommended:** delete the unreachable branch (hosts *should* be able to re-enter via code — that's the rejoin behavior, which is correct).
- **Effort:** Small. **Status:** Recommended (P2).

### CODE-002 — Unused imports
- **Evidence:** `GameRoom.tsx` imports `CardFace` and `type Card` but uses neither.
- **Recommended:** remove; enforced automatically once CODE-003 lands. **Severity:** Low. **Effort:** Small. **Status:** Recommended (P2).

### CODE-003 — No ESLint configuration
- **Classification:** Testing/tooling gap. **Severity:** Medium. **Confidence:** Confirmed (validation table).
- **Evidence:** `package.json` has `"lint": "next lint"` but no `.eslintrc*`/`eslint.config.*` exists; the command opens an interactive wizard (breaks CI); `next lint` is deprecated for Next 16.
- **Recommended:** add a flat `eslint.config.mjs` using `eslint-config-next` (core-web-vitals) + `typescript-eslint`, change the script to `"lint": "eslint ."`, fix the handful of resulting findings (unused imports, etc.). Dev-dependency only.
- **Effort:** Small–Medium. **Status:** Recommended (P1).

### CODE-004 — Per-request DB read in JWT callback
- **Evidence:** `auth.ts:67-77` re-reads `displayName` from the DB on **every** session/JWT evaluation to keep it fresh.
- **Assessment:** measurable but harmless at this scale; freshness matters only if display names become editable (they currently are not — no UI exists to change them).
- **Recommended:** leave as-is; revisit if a profile-edit feature lands (then refresh on update instead). **Severity:** Low. **Status:** No action required (documented).

### CODE-005 — `DeckToggle` init quirks
- **Evidence:** `DeckToggle.tsx:25-28` reads `localStorage.getItem` without try/catch (throws in some privacy modes, unlike the guarded reader in `layout.tsx`) and initializes state to `"four"` before the effect runs, so a `"two"`-deck user sees the wrong option highlighted for a frame.
- **Recommended:** initialize from `document.documentElement.getAttribute("data-deck")` inside the effect (already set pre-paint by the layout script) and wrap storage access in try/catch to match the established pattern.
- **Severity:** Low. **Effort:** Small. **Status:** Recommended (P2).

### SEC-001 — `allowDangerousEmailAccountLinking`
- **Evidence:** `auth.ts:31`. Links a Google sign-in to an existing same-email credentials account.
- **Assessment:** with Google as the only OAuth provider (verified emails), the practical risk is low and the UX benefit real. Keep, but add a one-line comment documenting that this is safe *only* while every OAuth provider verifies emails.
- **Severity:** Informational. **Status:** No action required beyond the comment.

### SEC-002 — No rate limiting / lockout on auth endpoints
- **Evidence:** `/api/auth/register`, credentials `authorize`, `/api/match/join` accept unlimited attempts; invite codes are 5 chars from a 32-char alphabet (~33.5M combinations) — brute-forcing a *specific* code is impractical, bulk scanning is merely possible.
- **Assessment:** acceptable for a friends-scale app; bcrypt(10) protects stored passwords. If hardening is desired later, an in-process fixed-window limiter on the two auth endpoints is enough — no new dependency.
- **Severity:** Low. **Status:** Optional (P3).

### TEST-001 — No tests around the realtime/persistence layer
- **Classification:** Testing gap. **Severity:** Medium. **Confidence:** Confirmed.
- **Evidence:** Every confirmed high-impact bug in this report (BUG-001, BUG-002, REL-001…) lives in `src/server/` and `src/lib/match.ts` — exactly the untested layer. The engine (already tested) had zero defects.
- **Recommended:** Vitest suite for `gameManager` using a real SQLite test DB (Prisma against `file:./test.db`) and a mocked `io` (`fetchSockets` returning fake sockets). Cover: join-repopulates-guest (BUG-001 regression), auto-start, place/discard flow persisting `gameState`, scoring + stats on completion (incl. push/tie), match completion at `targetWins`, early end, restart-resume (fresh registry + `getLive` from DB). Plus small unit tests for `joinMatch` permutations and `userIdFromCookie` cookie names.
- **Effort:** Medium–Large. **Status:** Recommended (P1).

### DOC-001 — README inaccuracies and gaps
- **Evidence:** README "Note on live state" says in-progress state is memory-only and lost on restart — **outdated**: `Match.gameState` persistence landed in commit 4857d8e and works (verified in code and schema). README also implies seed-based auditability (see BUG-006), and documents `npm run lint` implicitly via scripts though it's broken (CODE-003).
- **Recommended:** update the live-state note, remove/qualify the seed claim until BUG-006 is fixed, document the lint command once it exists.
- **Severity:** Low. **Effort:** Small. **Status:** Recommended (P1, docs batch).

---

## 9. Screen-by-Screen UI Plan

Only screens that change are listed. All changes use existing Tailwind utilities and the standards in §5.

### UI-006 Settings modal (`GameRoom.tsx` → `SettingsModal`)
- **Current problems:** translucent sheet (UI-101); underlying board interferes with legibility; "End match" uses `window.confirm`.
- **Proposed layout (unchanged structure, new surface):**
  ```
  ┌──────────────────────────────┐
  │ Settings                   ✕ │
  │ Card deck   [2-color][4-color]│
  │ ──────────────────────────── │
  │ Notifications  [toggle/state]│
  │ How to play (link)           │
  │ (autosave note)              │
  │ [   Resume game  (primary) ] │
  │ [   End match    (danger)  ] │
  └──────────────────────────────┘
  ```
- **Changes:** container class `panel` → `rounded-2xl border border-white/10 bg-felt-800 p-4 shadow-xl`; keep everything else. `window.confirm` may stay (simple, works) — optional inline two-step confirm as polish.
- **Behavior preserved:** opening/closing never disturbs the socket or game state (this is correct today and documented in code).
- **Manual verification:** open over a busy mid-game board — every element fully legible; Resume returns to the exact same state; End match confirms then ends for both.
- **Acceptance criteria:** no board content visible through the sheet; contrast of all modal text ≥ 4.5:1.

### UI-007 Game-over panel (`GameOver`)
- **Current problems:** UX-102 (unnamed opponent).
- **Changes:** headline uses `oppName` (pass `oppBoard.displayName` down or derive from `snapshot`): "Bob won this game" / "You won the game!" / "Game tied"; sub-line "Hands won — you 2 · Bob 3". Button flow unchanged (`Next game →` → "Waiting for opponent…" → "Starting…").
- **Behavior preserved:** ready/double-click guard via `disabled={snapshot.youReady}`.
- **Acceptance criteria:** both clients see the opponent's real name; no layout shift on 390px width with 20-char names (truncate with `truncate max-w-[…]` if needed).

### UI-008 Match-over panel (`MatchOver`)
- **Current problems:** UX-102, REL-005 presentation.
- **Changes:** score line "Final score: You {yourScore} – {theirScore} {oppName}" computed from the viewer's seat; three visual cases: won (gold, 🏆), lost (neutral-dark, "NAME wins the match"), ended-early/no-winner (neutral, "Match ended").
- **Acceptance criteria:** guest and host each see themselves first; early-ended match shows neutral wording for both.

### UI-004 Waiting room (`WaitingRoom`)
- **Current problems:** UX-105; (BUG-001 fix makes the guest actually arrive).
- **Changes:** replace the "Cancel" link with a `btn-ghost` "Cancel game" that confirms, emits `match:cancel`, then navigates home. Keep code display and share button exactly as-is (they tested well).
- **Loading/empty:** unchanged.
- **Acceptance criteria:** after cancel, the game no longer appears in "Your games" on either device and the code can no longer be joined; after a guest joins (with BUG-001 fixed) the host's screen switches to the table within ~1 s without any user action.
- **Behavior preserved:** "← Leave"/back-navigation still leaves the match open for resume.

### UI-009/UI-010 Error and loading states (`GameRoom` top branches)
- **Current problems:** BUG-003, REL-004.
- **Proposed:** fatal errors keep today's centered screen; transient errors render as a toast: fixed bottom banner `rounded-xl bg-rose-500/90 text-white px-4 py-2`, auto-dismiss 3 s, `aria-live="assertive"`. "Connecting…" gains a Retry button after 8 s.
- **Acceptance criteria:** an out-of-turn tap never unmounts the table; killing and restarting the dev server mid-game lets both clients resume without manual reload (socket auto-reconnect + rejoin on `connect`, which already happens in `useGameSocket`).

### UI-005 Game table (labels + a11y only)
- **Changes:** `text-[8px]` → `text-[10px]` ("hidden"); result labels `text-[9px]` → `text-[10px]`; aria-labels per A11Y-104; `touch-action: manipulation` on interactive elements alongside UX-103.
- **Everything else (layout, fan geometry, turn banner, glow targets) is verified good — do not change.**

---

## 10. Prioritized Recommendations

### Priority 0 — Immediate (the app does not reliably work without these)
1. **BUG-001** stale-cache join failure — blocks the core flow.
2. **BUG-002** production socket-auth cookie mismatch — blocks any http-fronted deployment and local prod verification.
3. **REL-001** crash-proof the socket handlers — one bad write must not kill every game.
4. **BUG-003** transient errors must not destroy the game screen (it converts minor races into apparent data loss).

### Priority 1 — Core quality improvements
5. **UI-101** opaque Settings modal.
6. **UX-102** named opponents / labeled scores (incl. REL-005 screen wording).
7. **BUG-004** hydration warning fix.  8. **BUG-005** fetch failure handling.  9. **BUG-007** favicon.
10. **UX-103** re-enable zoom (+ `touch-action`).
11. **UX-105** cancel game from waiting room.
12. **CODE-003** ESLint config + clean run (includes CODE-002 removal).
13. **TEST-001** gameManager/match/socketAuth test suite (regression net for P0 fixes).
14. **BUG-006** persist real seeds (+ DOC-001 README corrections).

### Priority 2 — Valuable later
15. **REL-002** single-flight `getLive`.  16. **REL-003** transactional scoring.  17. **REL-004** connect-retry affordance.  18. **REL-005** stats semantics for early-ended matches (needs decision D2).
19. **A11Y-104** aria labels + live turn announcements.  20. **UI-106** minimum text size.  21. **CODE-001** dead branch.  22. **CODE-005** DeckToggle init.

### Priority 3 — Optional
23. **UX-107** discard label polish.  24. **SEC-002** auth rate limiting.  25. SEC-001 explanatory comment.

**Dependencies / order:** BUG-001+BUG-002+REL-001 first (they gate real two-device testing of everything else); TEST-001 immediately after, encoding those fixes as regressions; UI work (UI-101, UX-102…) is independent and can proceed in parallel; CODE-003 before the UI batch keeps the diff lint-clean; REL-003 after TEST-001 so the transaction refactor is covered.

---

## 11. Implementation Tasks

> Effort: S ≤ 1h, M ≤ half-day, L ≤ 2 days. All tasks preserve the engine (`src/lib/game/**`) untouched unless stated. Validation commands assume `npm ci` done and a `.env` copied from `.env.example` with a generated `AUTH_SECRET` and `npm run db:push` applied.

**T-001 · [BUG-001] Reconcile cached LiveMatch with DB on socket join** — *S, independent, Required*
- Files: `src/server/gameManager.ts` (`handleJoin`).
- Change `handleJoin`'s initial query to `prisma.match.findUnique({ where: { inviteCode: … }, include: { guest: true } })`. After `getLive`, if `live.guest` is null and `match.guestId` is set, assign `live.guest = { userId: match.guest.id, displayName: match.guest.displayName }` and `live.status = match.status as LiveMatch["status"]`. Do not overwrite a non-null `live.guest`. The existing auto-start block then fires naturally.
- Preserve: rejoin of either player; auto-start only when `gameNumber === 0`.
- Tests: T-013 case 1. Validation: `npm test`; manual two-browser join with host parked in the waiting room.
- Acceptance: guest join while host is connected → both screens show the table within 2 s.
- Rollback: revert the single function.

**T-002 · [BUG-002] Fix socket-auth cookie selection** — *S, independent, Required*
- Files: `src/server/socketAuth.ts`.
- Replace the `secure` computation with `const secure = (process.env.AUTH_URL ?? "").startsWith("https");`. Add a fallback second `getToken` attempt with the alternate cookie name if the first returns null (guards proxy/env skew).
- Tests: T-013 case 8 (unit, both cookie names). Manual: `npm run build && npm run start` with `AUTH_URL=http://localhost:3000` → play screen connects.
- Acceptance: sockets authenticate in dev, prod-http, and prod-https configurations.

**T-003 · [REL-001] Make socket handlers crash-safe** — *S, independent, Required*
- Files: `server.ts`.
- Wrap every `void handleX(...)` call in a catch that logs (`console.error("[socket]", event, err)`) and emits `socket.emit("errorMsg", { message: "Something went wrong — please try again." })` on failure. Add `process.on("unhandledRejection", ...)` logging (no exit).
- Preserve: `IllegalMoveError` handling stays inside `applyMove` (user-specific messages).
- Tests: T-013 case 7. Acceptance: a forced Prisma failure during `game:place` logs and keeps the process alive; client sees the retry message.

**T-004 · [BUG-003] Transient vs fatal error handling in the client** — *M, independent, Required*
- Files: `src/components/useGameSocket.ts`, `src/components/GameRoom.tsx`.
- In the hook: rename state → `fatalError`, add `notice`. `errorMsg` handler: if no snapshot has ever arrived OR message is "Game not found" / "You are not part of this game" → `fatalError`; else `notice` with a 3 s auto-clear (clear pending timer on unmount). `connect_error` → `fatalError` only if never connected; also surface `connected` so the UI can show a reconnect chip.
- In `GameRoom`: full-screen branch keys off `fatalError`; render `notice` as the toast described in §9 (UI-009); while `connected === false` and a snapshot exists, show a slim "Reconnecting…" chip instead of unmounting.
- Acceptance: double-tapping a row never leaves the table; stopping the server for 5 s mid-game shows the chip, then recovers automatically.

**T-005 · [UI-101] Opaque settings modal** — *S, independent, Required (P1)*
- Files: `src/components/GameRoom.tsx` (`SettingsModal`).
- Replace `className="panel w-full max-w-sm"` with `className="w-full max-w-sm rounded-2xl border border-white/10 bg-felt-800 p-4 shadow-xl"`.
- Acceptance: per §9 UI-006.

**T-006 · [UX-102/REL-005-UI] Name opponents; label scores; neutral early-end** — *S, independent, Recommended*
- Files: `src/components/GameRoom.tsx` (`GameOver`, `MatchOver`, call sites pass `oppName`).
- Implement §9 UI-007/UI-008 exactly. `MatchOver` derives `yourScore/theirScore` from `you` seat; three result variants (won / lost / no-winner).
- Acceptance: per §9; long names truncate without wrapping the panel.

**T-007 · [BUG-004+BUG-007] Layout hygiene: suppressHydrationWarning + icons** — *S, independent, Recommended*
- Files: `src/app/layout.tsx`.
- Add `suppressHydrationWarning` to `<html>`; add `icons: { icon: "/icon.svg" }` to `metadata`.
- Acceptance: no hydration errors and no favicon 404 in a fresh session's console on `/`, `/login`, `/play/<code>`.

**T-008 · [BUG-005] Handle fetch failures in Lobby/Register/Share** — *S, independent, Recommended*
- Files: `src/components/Lobby.tsx`, `src/app/register/page.tsx`, `src/components/GameRoom.tsx` (`share`).
- try/catch/finally as specified in Finding BUG-005; share falls back to a no-op with the code still visible if clipboard is unavailable.
- Acceptance: with DevTools offline, Create/Join/Register each show an error and re-enable within 1 s.

**T-009 · [UX-103] Restore zoom; prevent double-tap zoom locally** — *S, independent, Recommended*
- Files: `src/app/layout.tsx` (viewport), `src/app/globals.css`.
- Remove `maximumScale`/`userScalable`; add `touch-action: manipulation;` to the `.btn`-family rule and a `button { touch-action: manipulation; }` rule (covers card/row buttons).
- Acceptance: pinch zoom works on `/how-to-play`; rapid taps on rows don't zoom during play (manual mobile-emulation check).

**T-010 · [UX-105] Cancel game from the waiting room** — *M, depends on T-001 landing first (same file region), Recommended*
- Files: `src/lib/realtime/events.ts` (add `"match:cancel": () => void` client→server), `server.ts` (register handler), `src/server/gameManager.ts` (new `handleCancel`: only host, only `status === "lobby"`; set DB `status: "abandoned"`, delete registry entry, emit a final snapshot or a `fatalError`-style `errorMsg("This game was cancelled")` to any other room member), `src/components/GameRoom.tsx` (`WaitingRoom` button + confirm + `router.push("/")`), `src/components/useGameSocket.ts` (expose `cancel`).
- Preserve: active/complete matches cannot be cancelled this way (End match covers active).
- Tests: T-013 case 6. Acceptance: per §9 UI-004.

**T-011 · [CODE-003+CODE-002+CODE-001] ESLint + dead-code cleanup** — *M, independent, Recommended*
- Files: new `eslint.config.mjs`; `package.json` (`"lint": "eslint ."`, devDeps `eslint`, `eslint-config-next`); `src/components/GameRoom.tsx` (drop unused `CardFace`, `Card` imports); `src/lib/match.ts` (delete unreachable host-join branch).
- Config: flat config extending `next/core-web-vitals` + TS support; ignore `.next/`, `node_modules/`.
- Acceptance: `npm run lint` exits 0 non-interactively; no rule downgraded to get there except documented, justified ones.

**T-012 · [BUG-006+DOC-001] Persist real seeds; correct README** — *S, independent, Recommended*
- Files: `src/server/gameManager.ts` (add `gameSeed: number | null` to `LiveMatch`; set in `startGame`; write in `persistAndScore`; restore as null in `getLive` — see decision D3), `README.md` (update "Note on live state" to describe DB-persisted resume; qualify the seed/audit claim; document lint).
- Acceptance: new `Game` rows carry non-zero seeds for games completed without a server restart; README matches reality.

**T-013 · [TEST-001] Realtime/persistence test suite** — *L, after T-001/T-002/T-003, Recommended*
- Files: new `src/server/__tests__/gameManager.test.ts`, `src/lib/__tests__/match.test.ts`, `src/server/__tests__/socketAuth.test.ts`; `vitest` config addition if a setup file is needed (test DB path via `DATABASE_URL=file:./test.db`, `prisma db push` in a global setup or pretest script).
- Mock strategy: fake `io` object `{ in: () => ({ fetchSockets: async () => fakeSockets }) }`; fake sockets `{ data: { userId }, emit: vi.fn(), join: vi.fn() }`. No real Socket.IO server needed.
- Cases: (1) BUG-001 regression — cache seeded before DB join, guest then accepted and game auto-starts; (2) place/discard round-trip persists `gameState`; (3) completion → `Game` row + correct stats incl. streaks; (4) push (tie) stats; (5) `targetWins` reached → match complete + match stats; (6) cancel semantics (T-010); (7) handler resilience — Prisma failure rejected inside handler doesn't propagate (spy on console.error); (8) `userIdFromCookie` accepts both cookie names; (9) `joinMatch`: unknown code / full / finished / rejoin host / rejoin guest.
- Acceptance: `npm test` green including new suites; BUG-001 test fails if T-001 is reverted.

**T-014 · [REL-002] Single-flight getLive** — *S, independent, Recommended (P2)* — as specified in the finding; test: two concurrent calls → same instance.

**T-015 · [REL-003] Transactional persistAndScore** — *M, after T-013, Recommended (P2)*
- Restructure `persistAndScore`+`applyGameStats`+`applyMatchStats`+`saveState` writes into one `prisma.$transaction(async (tx) => { … })`, passing `tx` in place of `prisma`. Keep identical resulting values (covered by T-013 cases 3–5, which must stay green).

**T-016 · [REL-004] Connect-retry affordance + connect_error logging** — *S, independent, Recommended (P2)* — per §9 UI-010.

**T-017 · [A11Y-104+UI-106] Game a11y + minimum text size** — *M, independent, Recommended (P2)*
- Files: `src/lib/game/cards.ts` (add `SUIT_NAME: Record<Suit,string>`), `src/components/GameRoom.tsx`, `src/components/PlayingCard.tsx`.
- Add aria-labels/`aria-pressed`/`aria-live` per finding; bump `text-[8px]`→`text-[10px]`, `text-[9px]`→`text-[10px]`.
- Acceptance: screen-reader (or accessibility-tree inspection) announces "Your turn", card names, and row targets; no layout overflow at 390×844.

**T-018 · [REL-005-stats] Early-end match semantics** — *S, needs decision D2, Recommended (P2)*
- `handleEndMatch`: increment `matchesPlayed` for both (no `matchWins`) when ending an `active` match. Skip for `lobby` matches (those use T-010 cancel).

**T-019 · [UX-107] Discard label polish** — *S, independent, Optional* — "Discard" / "Discard used" labels.

**T-020 · [SEC-002] Minimal auth rate limiting** — *M, independent, Optional*
- In-process `Map<ip, {count, windowStart}>` limiter (e.g. 10/min) on `/api/auth/register` and a failed-attempt delay in the credentials `authorize`. No new dependencies. Document that multi-instance deployments need a shared store (out of scope).

---

## 12. Implementation Batches

Each batch leaves the project buildable and ends with: `npx tsc --noEmit && npm test && npm run build` (plus `npm run lint` once Batch 3 lands), followed by the listed manual checks. One commit per batch.

**Batch 1 — Baseline protection & critical fixes** · Tasks T-001, T-002, T-003 · Files: `gameManager.ts`, `socketAuth.ts`, `server.ts`.
Order: T-002 → T-001 → T-003. Validation: full command set above (lint not yet available); manual: two-browser create→join with host in waiting room (dev *and* `npm run start` over http); forced DB error survives. Complete when: the primary flow works end-to-end in both modes and the server survives injected write failures.

**Batch 2 — Client error handling** · Tasks T-004, T-008, T-016 · Files: `useGameSocket.ts`, `GameRoom.tsx`, `Lobby.tsx`, `register/page.tsx`.
Validation: build/tests; manual: double-tap race, server bounce mid-game, offline create/join/register, 8-s connect stall shows Retry. Complete when: no path unmounts a live table except fatal membership errors.

**Batch 3 — Lint baseline** · Task T-011 · Files: `eslint.config.mjs`, `package.json`, small cleanups.
Validation: `npm run lint` exits 0 in a clean checkout; build/tests green. (Placed before UI work so subsequent diffs stay lint-clean.)

**Batch 4 — Shared UI standards & primary screens** · Tasks T-005, T-006, T-007, T-009 · Files: `GameRoom.tsx`, `layout.tsx`, `globals.css`.
Validation: build/tests/lint; manual: settings modal legibility, named results on both clients, console clean of hydration/favicon errors, pinch zoom on rules page, no double-tap zoom in play. Complete when: §9 acceptance criteria for UI-006/007/008 pass on a 390×844 viewport.

**Batch 5 — Secondary flows** · Tasks T-010, T-012 · Files: `events.ts`, `server.ts`, `gameManager.ts`, `GameRoom.tsx`, `useGameSocket.ts`, `README.md`.
Validation: build/tests/lint; manual: cancel-game flow on two devices; seed values visible in DB (`npm run db:studio`). Complete when: §9 UI-004 acceptance passes and no stale "Waiting" entries remain after cancel.

**Batch 6 — Regression net** · Task T-013 (+ T-014) · Files: new test files (+ `gameManager.ts` single-flight).
Validation: `npm test` — new suites green; temporarily reverting T-001 makes case 1 fail (spot-check, then restore). Complete when: all nine cases pass in CI-style clean run.

**Batch 7 — Reliability hardening** · Tasks T-015, T-018 · Files: `gameManager.ts`.
Validation: T-013 suites stay green (values unchanged under transaction); manual early-end updates both profiles' matches-played. Requires decision D2 for T-018.

**Batch 8 — Accessibility & polish** · Tasks T-017, T-019 · Files: `cards.ts`, `PlayingCard.tsx`, `GameRoom.tsx`.
Validation: build/tests/lint; manual accessibility-tree inspection; visual check of 10px labels at 390×844. Complete when: §9 UI-005 criteria pass.

**Batch 9 — Documentation & optional hardening** · DOC-001 remainder (if any), T-020 (only if approved) · Files: `README.md`, API routes.
Validation: docs match behavior; rate-limit returns 429 after threshold in manual test.

---

## 13. Regression Test Checklist

Run after each batch (items marked ☐ are manual; two devices/browsers = A host, B guest):

- ☐ **Startup:** `npm run dev` and `npm run build && npm run start` (with http AUTH_URL) both serve `/login`; console free of errors.
- ☐ **Auth:** register new user (auto-signs-in → home); sign out; sign in; wrong password shows inline error; register with existing email shows 409 message.
- ☐ **Primary flow:** A creates game → waiting room shows code; B joins by code *while A is on the waiting room* → both see the table ≤ 2 s; turn alternation enforced; placed counter advances; discard works exactly once; game plays to showdown; hand labels and green rings match a manual count; correct winner headline on both; Next game → ready gating → game 2 starts with the other player leading.
- ☐ **Resume:** mid-game, A closes the tab, reopens `/` → game listed with correct turn badge → tap → exact state restored. Restart the server mid-game → both clients reconnect and resume without reload.
- ☐ **Navigation:** ← Leave returns home without ending the match; Details → profile → Back; How to play from login and from settings modal.
- ☐ **Data entry & validation:** join with bad/short/full/finished codes → correct messages, button re-enables; invite code entry uppercases.
- ☐ **Database:** completed game creates a `Game` row with non-zero seed (post T-012); stats increments match the result (win/loss/push/five-o/streaks); match completion at `targetWins` sets winner and match stats.
- ☐ **External services:** with VAPID keys configured, background player receives a turn push; without keys, notification toggle shows the unsupported/absent state and nothing breaks.
- ☐ **Error & recovery:** double-tap a row → toast only; kill server 5 s → "Reconnecting…" chip → auto-recovery; offline Create/Join/Register → error + re-enabled buttons.
- ☐ **Loading/progress:** Connecting → Joining → Dealing sequence on slow network (DevTools throttling); Retry appears after ~8 s stall.
- ☐ **Resizing/DPI:** 390×844 (DPR 2/3) — table fits without scroll; 320px width — no horizontal overflow; desktop max-w-md centering; pinch zoom works on menu pages.
- ☐ **Keyboard/touch:** tab through login and lobby forms; Enter submits; in-game buttons focusable and activatable via keyboard; no double-tap zoom during rapid play.
- ☐ **Config compatibility:** existing dev SQLite DB from before the changes still loads (schema unchanged unless D3 chose a column — then `db:push` migrates cleanly).
- ☐ **Install/PWA:** manifest loads; service worker registers; app-shell loads offline; API/socket traffic bypasses the SW.
- ☐ **Upgrade/rollback:** each batch is a single revertable commit; reverting any UI batch leaves the server protocol compatible (only T-010 adds an event — its absence on either side is a silent no-op).

---

## 14. Definition of Done

- `npx tsc --noEmit`, `npm test`, `npm run build`, and `npm run lint` all pass clean.
- No confirmed Critical/High finding (BUG-001, BUG-002, BUG-003, REL-001, UI-101) remains open unless explicitly deferred by the user.
- The §13 checklist passes on two simultaneous devices in both dev and production-http modes.
- All screens match the §5 standards; success/warning/loading/empty/error states behave per §9.
- No avoidable duplicate operations (ready-button gating and turn gating verified).
- Diffs are narrowly scoped; no new runtime dependencies; no new abstractions beyond the ones specified here.
- Engine behavior byte-identical (existing 28 tests untouched and green).
- New behavior covered by the T-013 suite.
- This document updated with per-task status and any deviations.

---

## 15. Deferred and Rejected Ideas

| Idea | Verdict | Reason |
|---|---|---|
| Rewrite realtime layer with a state library / event bus / Redis adapter | Rejected | Unnecessary complexity; single-process design is a documented constraint and fits the product |
| Replace hand-rolled `sw.js` with next-pwa/Workbox | Rejected | Dependency cost; current SW is small, readable, correct |
| Switch UI framework or add a component library | Rejected | Current Tailwind system is consistent and sufficient; framework churn is pure regression risk |
| Always reload match state from DB on every socket event (drop the registry) | Rejected | Better incremental alternative chosen (T-001 reconcile + T-014 single-flight); full reload loses ready-state and adds per-event reads |
| Store every move for full game replay | Deferred | Low user value now; seed persistence (T-012) preserves the audit option cheaply |
| Refresh-on-focus/polling fallback for home-page turn badges | Deferred | Low value once push works; revisit if users report stale lists |
| Password reset / email verification flows | Deferred | Scope expansion; needs an email provider decision first (see D5) |
| Redis/shared-store rate limiting & sessions for multi-instance scaling | Deferred | Lack of evidence it's needed; single instance is the documented target |
| Spectator mode, rematch invitations, in-game chat | Deferred | Scope expansion beyond assessed product intent |
| Upgrading next-auth beta / Next / React majors | Rejected for this plan | No defect traced to versions; upgrade churn without need (operating rule 11) |

---

## 16. Assumptions and Open Decisions

**Assumptions**
- A1: Single-server deployment (no horizontal scaling) remains the target — the in-memory registry design depends on it (README concurs).
- A2: The one dev-mode "Connecting…" hang (REL-004) is environmental/transient; the mitigation is an affordance, not a root-cause fix.
- A3: Display names are immutable post-registration (no edit UI exists), making CODE-004's per-request freshness read unnecessary but harmless.
- A4: Production deployments use HTTPS `AUTH_URL`; BUG-002 still matters for local prod verification and http-internal proxies.
- A5: Emulated-mobile verification is representative; no device lab was available.

**Open decisions** (implementation may proceed without them except where noted)

| # | Decision | Recommended default | Alternatives & effects | Blocks |
|---|---|---|---|---|
| D1 | Transient-error UX: toast vs inline banner under the turn banner | Toast (bottom, auto-dismiss) | Inline banner is less intrusive but shifts layout | Nothing (T-004 proceeds with default) |
| D2 | Early-ended match stats | Count `matchesPlayed` for both, no winner | (a) current: count nothing — understates history; (b) award win to the non-ender — punitive, enables abuse | T-018 only |
| D3 | Seed persistence across restarts | Memory-only (`seed 0` after restart-resume, documented) | Add `Match.gameSeed` column + `db:push` — complete but touches schema | T-012 detail only |
| D4 | Rate limiting (T-020) | Skip for now | Implement in-process limiter — small hardening, slight complexity | T-020 |
| D5 | Account management (password reset etc.) | Out of scope | Needs email provider + product decision | none (deferred) |

---

## 17. Codex Execution Instructions

1. Read this plan and all repository-specific instruction files (none existed at assessment time; re-check for CLAUDE.md/AGENTS.md).
2. Check `git status` and preserve any existing user changes before starting.
3. Revalidate the documented baseline (§6 commands) and confirm results match; investigate discrepancies before editing.
4. Implement only the task IDs approved by the user.
5. Follow the batch order in §12; do not interleave batches.
6. Keep changes narrowly scoped to the files listed per task.
7. Preserve existing intended functionality — especially the untouched engine (`src/lib/game/**`) and the persistence/resume design.
8. Use the documented UI standards (§5) for all visual changes.
9. Prefer simple implementations using the existing stack; the only permitted new dev-dependencies are ESLint packages (T-011).
10. Do not introduce new abstractions or runtime dependencies beyond those specified.
11. Run the batch's validation commands after every batch (`npx tsc --noEmit && npm test && npm run build`, plus `npm run lint` from Batch 3 on).
12. Perform the manual UI checks listed per batch (§12) where possible; on a headless environment, use the Playwright two-session approach described in §6.
13. Update this document with task status, results, and deviations as you complete work.
14. Stop and ask the user if repository conditions contradict this plan (e.g. the bugs appear already fixed, or conflicting new code exists).
15. Do not commit, push, or create a pull request unless separately requested by the user.
