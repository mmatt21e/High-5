import { cardId } from "./cards";
import type { GameView } from "./types";

/** Only public view data participates. Concealed cards never get identities. */
export function visibleCardLocations(view: GameView): Map<string, string> {
  const result = new Map<string, string>();
  view.players.forEach((player, seat) => {
    player.rows.forEach((row, rowIndex) => row.forEach(card => {
      if (card.state === "card") result.set(cardId(card.card), `${seat}:row:${rowIndex}`);
    }));
    if (seat === view.you || view.phase === "complete") player.hand.forEach(card => {
      if (card.state === "card") result.set(cardId(card.card), `${seat}:hand`);
    });
  });
  return result;
}

export function describeMotionChanges(before: GameView, after: GameView) {
  const previous = visibleCardLocations(before), current = visibleCardLocations(after);
  return {
    entered: [...current.keys()].filter(id => !previous.has(id)),
    moved: [...current.keys()].filter(id => previous.has(id) && previous.get(id) !== current.get(id)),
    placedByYou: [...current.keys()].filter(id => previous.get(id) === `${after.you}:hand` && current.get(id)?.startsWith(`${after.you}:row:`)),
    removed: [...previous.keys()].filter(id => !current.has(id)),
    completedRows: after.players.flatMap((player, seat) => player.rows.flatMap((row, index) =>
      row.filter(card => card.state === "card").length === 5 && before.players[seat].rows[index].filter(card => card.state === "card").length < 5 ? [`${seat}:${index}`] : [])),
    showdown: before.phase !== "complete" && after.phase === "complete",
    turnChanged: before.toMove !== after.toMove,
    trickResolved: Boolean(before.exhibition?.pending && !after.exhibition?.pending),
  };
}
