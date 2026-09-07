import { avatarPreset } from "@/lib/avatars";

export function PlayerAvatar({ avatar, name, size = "md" }: {
  avatar?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const preset = avatarPreset(avatar);
  const image = avatar?.startsWith("/api/players/") || avatar?.startsWith("https://");
  return (
    <span className={`player-avatar player-avatar-${size}`} style={{ backgroundColor: preset.color }}>
      {image ? (
        // Stored uploads are already resized to 128px and served from our API.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar!} alt={`${name}'s avatar`} width={128} height={128} referrerPolicy="no-referrer" />
      ) : <span role="img" aria-label={`${name}'s ${preset.label.toLowerCase()} avatar`}>{preset.symbol}</span>}
    </span>
  );
}
