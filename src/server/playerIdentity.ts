import { createHash } from "node:crypto";
import { AVATAR_DATA_PREFIX, type PublicPlayer } from "../lib/avatars";
import { COMPUTER_OPPONENTS, isComputerLevel } from "../lib/computer";

// Never put uploaded image bytes, email addresses or account fields in search
// results, match snapshots or session cookies.
export function publicPlayer(user: {
  id: string;
  displayName: string;
  image: string | null;
  computerLevel?: string | null;
}): PublicPlayer {
  let avatar = "avatar:spade";
  if (user.image?.startsWith("avatar:")) avatar = user.image;
  else if (user.image?.startsWith(AVATAR_DATA_PREFIX)) {
    const version = createHash("sha256").update(user.image).digest("hex").slice(0, 16);
    avatar = `/api/players/${encodeURIComponent(user.id)}/avatar?v=${version}`;
  } else if (user.image?.startsWith("https://")) avatar = user.image;
  const displayName = isComputerLevel(user.computerLevel)
    ? COMPUTER_OPPONENTS[user.computerLevel].name : user.displayName;
  return { id: user.id, displayName, avatar,
    ...(isComputerLevel(user.computerLevel) ? { computerLevel: user.computerLevel } : {}) };
}

export const playerSelect = { id: true, displayName: true, image: true, computerLevel: true } as const;
