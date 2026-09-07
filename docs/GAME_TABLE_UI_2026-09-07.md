# Side Rail game table — September 7, 2026

## Selected design

Design 5 from `ui-examples/five-structural-redesigns.html`: vertical controls,
square cards, system typography, and a full-width private hand dock in the shared
green, cream, and gold theme. The gallery remains available for comparison.

The opponent sits above the local player. Both boards use identical four-column
geometry, so Row 1 aligns with Row 1 through Row 4. Scores, the first-to target,
draw-deck count, Discard, Settings, and lobby navigation occupy the left rail.
Opponent hand placeholders are omitted during play. At actual showdown, both
concealed hands become a fifth aligned column. An early match end keeps four
public columns and uses neutral wording.

The table fits the viewport with a stable bottom hand dock. Cards fan vertically
on normal displays; short landscape displays spread cards horizontally within
each column while keeping the players stacked. Short portrait showdown screens
use five compact rank/suit tiles per column. The Settings modal scrolls separately
so its full appearance controls remain reachable.

Gameplay card faces use square geometry, exposed rank/suit indices, and large
central ranks. Saved table colors, suit palettes, and deck stock/border choices
remain effective. Full card artwork remains in the appearance previews.

## Placement and completion feedback

Each player stores an optional `lastPlacement` containing the public card ID and
row index. A successful placement updates only that player's marker. Discarding
preserves the last placement. Existing JSON persistence saves the marker without
a database migration; legacy games acquire a marker on their next placement.
New games start without markers.

The latest card has a gold outline and a **Last** label, with its identity included
in the row's accessible description. Full rows have a checkmark and **Complete**
label. Showdown adds Won/Lost/Tied and a poker-hand classification. Long labels
have full accessible descriptions and title text.

## Validation

Browser checks use authenticated local accounts, real Socket.IO events, and an
isolated SQLite QA database. Development-only Next.js badges are hidden in the
browser harness to prevent them covering gameplay controls.

- Active play, showdown, and early-end screens fit 320×568, 390×844, 1280×720,
  and 844×390 without document scrolling, internal scrolling, or offscreen cards
  and controls. Corresponding row x positions and widths match.
- Twenty active/showdown cases additionally cover 360×640, 414×896, 768×1024,
  1024×768, 667×375, and 1920×1080. Card bounds and rank/suit indices remain
  contained; following cards do not obscure the exposed indices.
- Both seats place cards; selection does not shift board geometry. Independent
  Last markers survive reload and discard. Settings closes with Escape and
  returns focus to its control.
- Actual completion reveals both fifth hands. Next game restores the private
  dock and eight public rows, with no stale Last markers. Early end does not
  reveal concealed hands.
- All 360 appearance combinations at 320×568 preserve alignment, screen fit,
  and top-index containment. This is a geometry check, not individual manual
  visual review of every combination.
- A stopped-server connection notice fits the 320×568 status strip, with both
  Last markers still visible.

`npm run check` passes lint, TypeScript, all 191 tests across 25 files, schema
validation, and fresh/upgrade migration verification. `npm run build` and
`git diff --check` pass. Browser evidence uses the local development server.

Evidence and fixture scripts are local under `.Codex/`. Screenshots were visually
reviewed at phone, desktop, and short landscape sizes. Arbitrary browser zoom and
window sizes are not exhaustively covered.

Deploy using the existing single-replica Docker/Tunnel workflow, preserving the
SQLite volume and taking a stopped-writer backup before restarting the app.
