# Guided practice

The public `/practice` route teaches the standard Five-O rules without an account. It is linked from the Five-O introduction, written rules, and signed-in lobby.

## Player experience

1. Start with five concealed cards, draw a sixth automatically, and place the nine of hearts in Row 1.
2. Play a previously held nine of diamonds to build a pair, keeping the aces concealed.
3. Discard the two of spades. This spends the whole turn, leaves the rows unchanged, and consumes the one discard allowed per game.
4. Let the lesson play the middle turns for both sides, then make the final placement. Preview both the completed row and the five cards kept for the hidden hand.

The final choice is deliberately meaningful. Playing the ace of spades completes a flush, keeps two pair, and wins three hands to two. Playing the jack of hearts keeps a full house but loses three open rows. The result screen reveals all five comparisons and lets the player try another final card.

Hints, gentle correction, undo, restart, and keyboard controls are available. The first three activities use specific teaching moves; the final activity accepts any legal held card. Practice does not change the rules or controls of ordinary matches.

## Implementation boundaries

- `src/lib/game/practice.ts` sets up one unique 52-card teaching deal and advances it with the existing `placeCard`, `discardCard`, and `viewFor` functions. Showdown uses the existing evaluator.
- Automatic moves use the existing medium strategy with a deterministic random source. Only the acting seat's redacted view reaches that strategy.
- `src/components/GuidedPractice.tsx` reuses the existing card artwork and appearance tokens. It renders no opponent concealed faces before showdown.
- No match, account, socket connection, statistics, rating, or game history entry is created. The shared page provider may still read the current sign-in session.
- Undo replays the lesson to just before the last player move, including reversing any intervening automatic turns. It is intentionally available only in practice.
- Local storage key `fiveo-guided-practice-v1` contains a versioned log of at most eight accepted actions, not a serialized deck. Invalid, stale, oversized, or out-of-order logs reset safely. Unavailable storage leaves the lesson playable until the page closes.
- Progress is device/browser-local. This feature does not add account synchronization, a general solo sandbox, native Android packaging, or guaranteed offline page loading.

The teaching deal and automatic strategy together define the lesson. If either changes the fixed draw sequence or final teaching position, update the instructions and assertions, and bump both the storage key and saved format version before shipping.

## Verification

`src/lib/game/__tests__/practice.test.ts` checks card conservation, legal turns, discard behavior, hidden-card redaction, alternative final choices, undo, and all saved checkpoints. `src/components/__tests__/GuidedPractice.test.tsx` exercises the full guest lesson with the real card components, correction and hints, final-hand previews, both endings, remount/resume, restart, unavailable storage, and absence of fetch calls from the lesson.

Run with the repository's supported Node 22 runtime:

```text
vitest run --exclude '**/.Codex/**'
eslint . --max-warnings=0
tsc --noEmit --incremental false
next build
```

Browser validation covers the full lesson, alternate ending, keyboard final placement, resume, and the handoff to ordinary sign-in. Phone layouts at 390 and 320 CSS pixels retain six 44-pixel card targets without horizontal page overflow.
