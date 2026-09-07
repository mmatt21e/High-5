export const AVATARS = [
  { id: "spade", label: "Spade", symbol: "♠", color: "#233345" },
  { id: "fox", label: "Fox", symbol: "🦊", color: "#663819" },
  { id: "owl", label: "Owl", symbol: "🦉", color: "#54432c" },
  { id: "cat", label: "Cat", symbol: "🐱", color: "#59452a" },
  { id: "wolf", label: "Wolf", symbol: "🐺", color: "#3b4858" },
  { id: "panda", label: "Panda", symbol: "🐼", color: "#345245" },
  { id: "frog", label: "Frog", symbol: "🐸", color: "#344c27" },
  { id: "octopus", label: "Octopus", symbol: "🐙", color: "#633749" },
] as const;

export function avatarPreset(value: string | null | undefined) {
  return AVATARS.find((avatar) => `avatar:${avatar.id}` === value) ?? AVATARS[0];
}

export const AVATAR_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const AVATAR_DATA_PREFIX = "data:image/webp;base64,";

export interface PublicPlayer {
  id: string;
  displayName: string;
  avatar: string;
}
