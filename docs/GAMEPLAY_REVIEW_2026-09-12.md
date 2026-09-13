**Five-O gameplay and feature evaluation — September 12, 2026**

Five-O has a promising strategic core: every card committed to a visible row is a card surrendered from the concealed fifth hand, and winning three corresponding hands rewards allocating strength across the board. The most useful next investments are helping players understand those decisions, finish a satisfying session, and find a reason to return.

This is a product assessment, not evidence of market demand or a statistically validated balance study. Review covered the current working-tree rules and implementation, the introduction/rules/catalog flow in the existing local preview, and saved mobile gameplay screenshots. The five inspected core gameplay/UI files matched the existing QA snapshot. HEAD was `961d3db`; unrelated local changes were present. Automatic approval review blocked launching a separate disposable preview and supplied no detailed reason. Consequently, this review includes no fresh complete-match playthrough, physical Android test, or new user study. No application code or live game data was changed.

**What is already working in the design**

- Four public rows plus a concealed fifth hand create a concrete tradeoff between immediate board strength and the final reveal.
- Winning three hands encourages choosing which rows to contest instead of simply collecting the strongest possible individual hand.
- The one-discard allowance introduces a limited recovery decision without requiring a currency economy.
- Three standard computer opponents and the separate Wildcard exhibition provide both learning opportunities and variety. Standard opponents operate on a redacted view rather than inspecting hidden cards.
- Tap placement, drag placement, last-card markers, aligned rows, four-color suits, and motion controls already provide a useful interaction foundation.
- Matchmaking, invitations, saved matches, turn notifications, personal history, and appearance choices already exist. Recommendations below extend those features where appropriate.

**Confirmed gaps and inconsistencies**

| Finding | Evidence | Player consequence |
|---|---|---|
| Starting a normal game requires an account; there is no guided guest practice entry in the reviewed flow. | `src/components/LandingPage.tsx`, `src/app/login/page.tsx`, `src/app/how-to-play/page.tsx` | A newcomer must register and interpret written instructions before experiencing the central card-placement decision. |
| The rules introduce Wildcard's many exceptions before teaching the basic turn. | `src/app/how-to-play/page.tsx:27` | Extra concepts compete with the information a first-time player needs immediately. |
| Shorter match lengths exist in the finder but are not offered consistently in computer and private-code creation. The rules still describe first-to-five as the match format. | `src/components/GameFinder.tsx:112`, `src/components/ComputerLobby.tsx:19`, `src/components/Lobby.tsx`, `src/server/computerMatches.ts`, `src/app/how-to-play/page.tsx:68` | Players can unintentionally start a longer session than intended. |
| Some play/lobby navigation points to the collection root. | `src/app/how-to-play/page.tsx:107`, `src/components/GameRoom.tsx:354`, `src/components/GameRoom.tsx:756` | The rules-page destination was verified in the browser: “Got it — let's play” returns to the Edge Games catalog. In-game lobby destinations are confirmed in source. |
| Showdown identifies hand categories and winners but does not explain the deciding rank or kicker. | `src/components/GameRoom.tsx:568`, `src/components/GameRoom.tsx:613`; saved mobile showdown screenshot | A new player can see both hands labeled Pair or High Card and still not understand the result. The five-column mobile showdown makes close inspection useful. |
| Ending a match completes it without awarding a forfeit winner; unfinished matches are excluded from match win/loss counts. | `src/server/gameManager.ts:635`, `src/app/profile/page.tsx` | This is a casual cancellation policy. Competitive records would need explicit surrender and abandonment rules so ending a losing match cannot avoid a match loss. Previously completed game results remain recorded. |
| Overall statistics combine human games with all three standard computer difficulties. | `src/app/profile/page.tsx:55` | The overall win rate is not a comparable measure of player-versus-player skill. Opponent-specific history already provides some separation. |

A standard game requires 40 card placements, plus up to two discard turns. A first-to-five match requires five to nine decisive games, with pushes potentially adding more. As an illustration, two human players averaging five seconds per turn would spend roughly 17–30 minutes on those decisive games before breaks. This is arithmetic, not a measured session duration; games against the computer can progress much faster.

**Recommended features, in priority order**

Effort is relative implementation scope: small, medium, or large. These are not delivery estimates.

| Priority | Feature | Recommended first version | Benefit | Effort |
|---|---|---|---|---|
| 1 | Guided practice and guest trial | A short, repeatable lesson with a prepared deal: select a card, choose a row, compare two candidate placements, use a discard, then reveal the fifth hand. Allow practice hints and undo; save progression if the player later creates an account. | Teaches the actual strategy and gives newcomers a successful first experience. | Medium |
| 2 | Consistent Quick / Standard / Long choices | Offer one-game, first-to-three, and first-to-five settings for every applicable opponent entry point. Make one-game Quick Play the obvious newcomer choice. Update rules and navigation together. | Fits short phone sessions while preserving longer matches. | Small–medium |
| 3 | Explainable showdown and inspectable history | Tap a row to enlarge both hands, highlight the deciding cards, and explain the winner in plain language. Explain pushes, including two wins, one loss, and two tied hands. Let history entries open their saved final boards. | Builds trust and helps players improve after a loss. | Medium |
| 4 | Clear live-play and asynchronous expectations | Show opponent presence, distinguish leaving from surrendering, provide a reconnect grace period, and define optional live-game clocks. Build an explicit “play at your own pace” flow around existing saves and turn notifications. | Reduces uncertainty and unfinished multiplayer sessions. | Medium–large |
| 5 | Offline Android practice | Run standard solo practice on the device, save locally, and offer optional account association later. Keep competitive server records authoritative. | Makes the app useful without internet and reduces Tower's computer-opponent workload. | Large |
| 6 | Daily challenge and small achievement set | Start with a prepared puzzle or daily deal. Use a clearly defined first scored attempt, with repeat attempts labeled practice. Add achievements for learning and varied accomplishments. | Provides a reason to return even when the multiplayer lobby is quiet. | Medium |
| 7 | Favorite opponents and rematch | Extend existing name search/invitations with favorites, a recent-opponent shortcut, and a rematch invitation after a completed match. Let players block unwanted invitations. | Makes repeat social play easier without requiring a chat system. | Medium |
| 8 | More meaningful progression and eventual ratings | Present human, computer, and difficulty-specific records clearly; preserve the existing overall total as labeled history. Introduce competitive ratings only after surrender rules and player population support them. | Makes progress understandable and gives experienced players longer-term goals. | Medium–large |

Interactive instruction and repeatable practice are consistent with the [Game Accessibility Guidelines on interactive tutorials](https://gameaccessibilityguidelines.com/include-interactive-tutorials/), [contextual help](https://gameaccessibilityguidelines.com/?p=3352), and [practice without failure](https://gameaccessibilityguidelines.com/include-a-means-of-practicing-without-failure-such-as-a-practice-level-or-sandbox-mode/). They support the design direction; they do not establish a measured retention improvement for Five-O.

If Android is pursued, Google Play Games Services offers [achievements, leaderboards, and saved-game features](https://developer.android.com/games/pgs/console/enable-features?hl=en). Those are implementation options; the current game already has its own accounts and server saves, so integration should preserve existing progress and identity.

**Additional gameplay options worth testing**

- Hand sorting by rank or suit, a clear marker on the newly drawn card, and an in-table hand-ranking reference. The current rules reference opens separately; a compact reminder would be easier during play.
- Optional placement/discard confirmation for players who want it, with immediate placement available for experienced players. Practice undo needs its own rules because undo after seeing a new card changes information available to the player.
- Optional sound and Android haptics with independent controls, complementing the existing visual and motion settings.
- A small Wildcard challenge ladder that introduces one trick at a time, then combines familiar tricks. The exhibition already has substantial mechanical variety; gradual introduction could make that variety more approachable.
- A duplicate-deal challenge against a fixed opponent, or short “win this position” puzzles. These use the game's allocation decisions and can function independently of a live multiplayer population.
- Move-by-move replay after final-board history. Full replay requires an appropriate action log; the current saved end state and opaque shuffle nonce are not sufficient to claim that every historical move can be reconstructed.

**Suggested delivery order**

1. Correct the navigation and match-length inconsistencies, then improve showdown explanations.
2. Add guided practice and a simple Quick Play entry. Test the first-session experience with unfamiliar players.
3. Add favorite opponents/rematches and a daily challenge to encourage repeat sessions.
4. If Android becomes the chosen release path, add offline practice and device-specific interaction polish.
5. Add competitive ratings and more modes when actual usage supports them. Maintain clear matchmaking defaults so a small player population can find opponents.

The core rules should be tested before changing their balance. Compare first/second-player results with mirrored deals, check whether the advertised computer difficulties form a useful progression, and observe whether players recognize when to strengthen their hidden hand or concede a public row. No conclusion about first-player advantage or calibrated difficulty is established by this review.

For the first release improvements, measure time to first legal move, first-game completion, match length, rematch rate, abandoned sessions, and return play. Keep initial measurement minimal and aggregate. A useful first study is watching unfamiliar players complete one game, explain why a close hand won, and start a second game without assistance.

**Assessment:** the greatest opportunity is making the existing strategy easier to learn and more satisfying to revisit. The next iteration should focus on Quick Play, guided practice, and clear results, followed by features that help people return and reconnect with opponents.
