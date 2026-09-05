/**
 * Accept only same-origin path callbacks. Authentication pages use this before
 * navigating so a crafted query string cannot turn sign-in into an open
 * redirect.
 */
export function safeCallbackPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";

  try {
    const base = "https://five-o.invalid";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
