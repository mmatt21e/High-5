import { getToken } from "next-auth/jwt";

/**
 * Decode the Auth.js session JWT from a raw Cookie header and return the
 * authenticated user id (set as `uid` in the jwt callback), or null.
 */
export async function userIdFromCookie(
  cookie: string | undefined,
): Promise<string | null> {
  if (!cookie) return null;
  const secure =
    process.env.NODE_ENV === "production" ||
    (process.env.AUTH_URL ?? "").startsWith("https");
  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  try {
    const token = await getToken({
      // getToken only reads headers.cookie from the request.
      req: { headers: { cookie } } as unknown as Parameters<
        typeof getToken
      >[0]["req"],
      secret: process.env.AUTH_SECRET,
      salt: cookieName,
      cookieName,
      secureCookie: secure,
    });
    return (token?.uid as string | undefined) ?? null;
  } catch {
    return null;
  }
}
