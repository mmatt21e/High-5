# Table animations

The table animates public game changes while the server remains authoritative.
No move, score, trick decision, or database operation waits for an animation.

[Watch a recording of the animated table](ui-examples/table-animations.gif).

## Effects

- New deals send cards from the deck into your hand, with a short stagger.
- Selected cards lift slightly. Placements travel into their rows, with the
  existing Last marker identifying the latest play afterward.
- Draws arrive from the deck; discarded or exchanged held cards return toward it.
- Row swaps and Second Thoughts visibly move the affected cards between rows.
- Row completion briefly highlights the row and introduces its check mark.
- Turn changes fade the active-player indicator into focus.
- Showdown introduces newly public cards with a short flip, then highlights
  winning rows and reveals the result. A local win gets a brief contained sparkle.
- Resolved tricks show a short stamp, including Play Fair!, Caught!, and Bluff!
  The existing trick log provides the durable explanation of what happened.
- Settings and the trick drawer enter with a short transition.

## Controls and accessibility

Appearance settings include **Full**, **Reduced**, and **Off**. The preference
is saved on the device and synchronized between tabs. A device request for
reduced motion takes precedence over Full. Reduced uses opacity effects for game
changes; Off displays updates immediately. Storage failure does not prevent play.

Effects are decorative, hidden from assistive technology, and cannot intercept
input. Existing accessible card descriptions, status announcements, and persistent
row/Last indicators remain the source of information. The board retains its fitted
layout; clipped overlays do not create document scrolling.

## Implementation

`MotionProvider.tsx` owns preferences. `useTableMotion.ts` measures visible cards
and animates decorative copies using the browser's Web Animations API. Most card
travel lasts 280 ms. Copies preserve the selected deck's computed appearance.
No new runtime dependency or schema migration is required.

`lib/game/motion.ts` compares redacted views. Hidden opponent cards never receive
client animation identities. `useGameSocket.ts` associates animation identity with
the incoming game view, keeping separate match metadata updates from triggering
a deal for the wrong board.

New updates cancel prior effects and restore real cards immediately. Disconnect,
resize, tab visibility changes, preference changes, and unmount also cancel effects.
Reconnect establishes a fresh baseline. A per-tab deal marker prevents reloads
from replaying a deal already shown. A resumed nonempty board appears immediately.

## Validation

- 218 tests across 27 files passed, including public-card identity, row-swap,
  completion, and showdown transition tests.
- Lint, TypeScript, schema validation, migration verification, and production
  build passed. Schema checks used an explicit local test database URL.
- Browser checks exercise real Socket.IO actions against isolated synthetic
  data, with the compiled application bound only to loopback. They cover card
  placement, swaps, next deals, reload, showdown, persisted Off, system Reduced,
  resizing during motion, and forced disconnect/reconnect.
- All 16 layout/recovery checks passed with no browser errors, hidden leftover
  cards, offscreen controls, or document scrolling. Viewports: 320×568, 390×844,
  1280×720, 844×390, and 667×375. A next-deal reload also passed without replay.

The preceding Wildcard feature and bot names were released separately as
`0266778`. Animations preserve those rules and the existing player records.
