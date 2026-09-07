# Wildcard Edge — House Rules exhibition

Wildcard Edge is the fourth computer opponent, chosen separately in the lobby.
It is a playful exhibition with explicit cheating and player counterplay.
Analyst Edge, House Edge, and Counter Edge keep their standard rules and records.

## What can happen

| Trick | Effect | Your response |
|---|---|---|
| Moving the Goalposts | A random public row is low-hand-wins for both players, declared at the initial deal. Normal poker ranking is reversed on that row only. | Plan around the marked LOW row. The rule stays fixed for this deal. |
| The Switcheroo | Edge swaps one card from each of two unfinished rows. | Allow or spend Play Fair! to cancel. |
| Ace Up the Sleeve | Edge exchanges its lowest held card for an ace from the remaining deck. | Allow or cancel. No extra ace is created. |
| Marked Cards | Edge sees your held cards for its next move and tries to retain a hand that beats yours. | Allow and gain a redraw, or cancel. |
| Second Thoughts | Edge relocates its last placement to another unfinished row. | Allow or cancel. The Last marker follows the card. |
| Caught Cheating? | Edge may really be hiding an ace or may be bluffing. | Allow, cancel, or challenge for free. Catching a real cheat cancels it and earns a redraw. A wrong call grants Edge a redraw. |
| Deal with the Devil | Accept to see two deck cards and exchange one held card for your choice. Edge gets a row swap. The unused offer and traded card go to the bottom of the deck. | Accept then choose, or decline at no cost. Once revealed, choose the trade or restart the exhibition. |
| Shared Chaos | Both players receive a redraw or row-swap power. Edge uses its power immediately. | Allow or cancel. Your power waits in the drawer. |
| Lucky Break | Edge grants you an extra redraw. | Take the gift. |

Each exhibition begins with one Play Fair! token, one Lucky Draw, and one human
row swap. Powers do not spend your turn. Human swaps require two different,
unfinished rows; redraws require a remaining deck card. Rewards add more powers.

The shuffled trick set offers at most one eligible trick every two Edge turns,
once per trick per deal. The low-hand rule is announced separately at the start.
Some tricks require particular cards or row shapes, so a single game need not
show every trick. Blocked and declined offers are consumed too. Edge continues
with an ordinary strategic placement after the response. Tricks never create
duplicate cards or increase row capacity.

## Interface

The left rail says **Exhibition / Untracked**, replacing match scores. **Tricks**
opens the decision or powers drawer; it marks a response waiting. Close the drawer
to inspect the board, then reopen it to respond. The game remains paused at a
decision. The LOW row is marked for both players. Card changes briefly highlight
the opponent board and respect reduced-motion settings.

The drawer includes powers, a chronological trick log with playful dialogue, and
a rulebook. **Fresh deal** restarts after confirmation. **Next game** starts a new
exhibition after showdown. Dialogs can scroll independently of the fitted board.

## Records, persistence, and isolation

- Wildcard games create no completed Game records and change no Stats, streaks,
  match scores, or match winners. They are excluded from opponent/history queries.
- The current Match board, powers, pending decision, and accepted deal offers are
  saved for resume. This is resumable state, not a statistical game history.
- The ranked completion transaction rejects Wildcard matches using their
  database-backed opponent identity as a second safeguard.
- Server-only state holds the remaining trick order and bluff outcome. Client
  views whitelist only public rule/power/log data and offers already accepted.
- Only the seated human can use these actions. Ordinary matches reject them.
  Responses carry a game-specific revision token, use the match mutation queue,
  and roll back if saving fails. Replayed or stale decisions cannot spend powers
  twice. Normal placement/discard cannot bypass a pending trick.
- The existing computerLevel TEXT field stores `wildcard`; no schema migration
  is needed. Bot account IDs and standard-player records remain stable.

## Validation — 2026-09-07

- `npm run check` passed: lint, TypeScript, 215 tests across 26 files, Prisma
  schema validation, and migration verification.
- `npm run build` and `git diff --check` passed.
- Browser QA passed 52 layout cases across 320×568, 390×844, 1280×720,
  844×390, and 667×375 viewports, plus trick responses, powers, reconnect,
  restart, showdown, lobby creation, profile exclusion, and ending an exhibition.
- Board checks found no document scrolling, offscreen cards or buttons,
  misaligned rows, or covered card rank/suit indices. Dialog content can scroll
  independently, with its controls reachable on small screens.
- Tests verified all tricks across seeded games, hidden-state redaction,
  stale-action rejection, save rollback, and unchanged statistics and streaks.
- Browser fixtures used the isolated local `prisma/ui-qa.db`.

Previews: [counterplay drawer](ui-examples/wildcard-edge-counterplay.png) and
[exhibition showdown](ui-examples/wildcard-edge-showdown.png).
