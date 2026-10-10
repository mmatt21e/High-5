import { isIP } from "node:net";

export type SportsLabConfig = { adminOrigin: URL; labOrigin: URL; bridgeOrigin: URL };

export function privateLabAddress(value: string) {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31;
}

export function strictOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Sports Lab requires HTTPS origins without credentials, paths or queries.");
  return url;
}

export function sportsLabConfig(env: Readonly<Record<string, string | undefined>> = process.env): SportsLabConfig | null {
  if (["SPORTS_LAB_TLS_CA_FILE", "SPORTS_LAB_TLS_CERT_FILE", "SPORTS_LAB_TLS_KEY_FILE", "SPORTS_LAB_BRIDGE_CERT_FILE"].some(name => env[name])) throw new Error("Legacy Sports Lab certificate configuration must be removed before enabling the approved LAN transport.");
  if (!env.SPORTS_LAB_ORIGIN && !env.SPORTS_LAB_BRIDGE_URL) return null;
  if (!env.SPORTS_LAB_ORIGIN || !env.SPORTS_LAB_BRIDGE_URL || !env.AUTH_URL) throw new Error("Sports Lab configuration is incomplete; access remains disabled.");
  const adminOrigin = strictOrigin(env.AUTH_URL);
  const labOrigin = strictOrigin(env.SPORTS_LAB_ORIGIN);
  const bridgeOrigin = new URL(env.SPORTS_LAB_BRIDGE_URL);
  if (labOrigin.hostname === adminOrigin.hostname || !labOrigin.hostname.endsWith(`.${adminOrigin.hostname}`)) throw new Error("Sports Lab must use a dedicated subdomain of the admin origin.");
  if (bridgeOrigin.protocol !== "http:" || !privateLabAddress(bridgeOrigin.hostname) || bridgeOrigin.port !== "18501" || bridgeOrigin.username || bridgeOrigin.password || bridgeOrigin.pathname !== "/" || bridgeOrigin.search || bridgeOrigin.hash) throw new Error("Sports Lab bridge requires a fixed private IPv4 HTTP origin on port 18501 without credentials, paths or queries.");
  // This hop relies on explicitly approved LAN trust, peer checks and host firewall restrictions.
  return { adminOrigin, labOrigin, bridgeOrigin };
}
