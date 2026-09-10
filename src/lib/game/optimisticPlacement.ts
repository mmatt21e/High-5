import { cardId } from "./cards";
import { CARDS_PER_HAND, type CardView, type GameView } from "./types";

/** Show only the known local card movement; draws, turns and results await the server. */
export function previewPlacement(view: GameView | null, id: string, row: number): GameView | null {
  if (!view || view.phase !== "playing" || !view.yourTurn || view.exhibition?.pending || !view.legalRows.includes(row)) return null;
  const player = view.players[view.you];
  const target = player.rows[row];
  const held = player.hand.find(card => card.state === "card" && cardId(card.card) === id);
  if (!held || held.state !== "card" || !target || target.filter(card => card.state !== "empty").length >= CARDS_PER_HAND) return null;
  const rows = player.rows.map((cards, index) => {
    if (index !== row) return cards;
    const placed: CardView[] = cards.filter(card => card.state !== "empty");
    placed.push(held);
    while (placed.length < CARDS_PER_HAND) placed.push({ state: "empty" });
    return placed;
  });
  const players: GameView["players"] = [...view.players];
  players[view.you] = { ...player, rows, hand: player.hand.filter(card => card !== held), lastPlacement: { cardId: id, row } };
  const placed: GameView["placed"] = [...view.placed];
  placed[view.you]++;
  return { ...view, players, placed, yourTurn: false, legalRows: [], canDiscard: false };
}
