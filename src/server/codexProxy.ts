import { ADMIN_COOKIE, getAdmin } from "./admin";

export const CODEX_PATH = "/admin/codex";
const securityHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(name + "="))?.slice(name.length + 1);
}
function failure(status: number, error: string) {
  return Response.json({ error }, { status, headers: securityHeaders });
}
export function rewriteCodexAsset(path: string, text: string) {
  if (path === "/") return text.replace(/(href|src)="\//g, `$1="${CODEX_PATH}/`);
  if (path === "/app.js") return text.replace(/(['"`])\/api\//g, `$1${CODEX_PATH}/api/`);
  return text;
}

/** Fixed upstream only. The website session and dashboard key are independent gates. */
export async function proxyCodex(request: Request) {
  const token = cookie(request, ADMIN_COOKIE);
  const authorized = async () => {
    const admin = await getAdmin(token);
    return !!admin && !admin.needsSetup;
  };
  const url = new URL(request.url);
  const path = url.pathname.slice(CODEX_PATH.length) || "/";
  if (!(await authorized())) {
    if (request.method === "GET" && path === "/") {
      return new Response(null, { status: 303, headers: { ...securityHeaders, Location: "/admin" } });
    }
    return failure(401, "Sign in to Edge Games administration to open Codex.");
  }
  const upstreamSetting = process.env.CODEX_DASHBOARD_URL;
  if (!upstreamSetting) return failure(503, "Codex access has not been configured.");
  if (!['GET', 'POST'].includes(request.method)) return failure(405, "Method not allowed.");
  if (!/^\/(?:app\.js|style\.css|api\/[a-zA-Z0-9/_-]+)?$/.test(path)) return failure(404, "Not found.");
  // Do not trust forwarded headers supplied by the browser to establish an origin.
  const publicOrigin = new URL(process.env.AUTH_URL || request.url).origin;
  if (request.method !== "GET" && request.headers.get("origin") !== publicOrigin) {
    return failure(403, "Origin rejected.");
  }
  if (request.method === "POST" && !request.headers.get("content-type")?.startsWith("application/json")) {
    return failure(415, "JSON required.");
  }
  const upstream = new URL(upstreamSetting);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== "/") {
    return failure(503, "Codex access configuration is invalid.");
  }
  const headers = new Headers();
  const dashboardToken = cookie(request, "tower_session");
  if (dashboardToken && /^[a-zA-Z0-9_-]+$/.test(dashboardToken)) headers.set("cookie", `tower_session=${dashboardToken}`);
  for (const name of ["content-type", "x-csrf-token"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (request.method === "POST") headers.set("origin", upstream.origin);
  const abort = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort.abort(), 20000);
  let recheck: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => { clearTimeout(timeout); clearInterval(recheck); abort.abort(); };
  request.signal.addEventListener("abort", cleanup, { once: true });
  try {
    let body: Uint8Array | undefined;
    if (request.method === "POST") {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 1024 * 1024) { await reader.cancel(); cleanup(); return failure(413, "Request too large."); }
        chunks.push(next.value);
      }
      body = Buffer.concat(chunks);
    }
    const result = await fetch(new URL(path + url.search, upstream), {
      method: request.method, headers, body: body as BodyInit | undefined,
      cache: "no-store", redirect: "manual", signal: abort.signal,
    });
    const responseHeaders = new Headers(securityHeaders);
    for (const name of ["content-type", "content-disposition"]) {
      const value = result.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    const sessionCookie = result.headers.get("set-cookie");
    if (sessionCookie?.startsWith("tower_session=")) {
      responseHeaders.set("Set-Cookie", sessionCookie.replace(/Path=\/($|;)/, `Path=${CODEX_PATH}$1`) + "; Secure");
    }
    if (["/", "/app.js", "/style.css"].includes(path)) {
      const text = rewriteCodexAsset(path, await result.text());
      cleanup();
      return new Response(text, { status: result.status, headers: responseHeaders });
    }
    if (path === "/api/events" && result.ok && result.body) {
      clearTimeout(timeout); timeout = undefined;
      responseHeaders.set("X-Accel-Buffering", "no");
      const reader = result.body.getReader();
      // Revoke an open event stream when the admin session expires or is logged out.
      recheck = setInterval(() => { void authorized().then((ok) => { if (!ok) cleanup(); }).catch(cleanup); }, 15000);
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) { cleanup(); controller.close(); }
            else controller.enqueue(next.value);
          } catch (error) { cleanup(); controller.error(error); }
        },
        cancel() { cleanup(); return reader.cancel(); },
      });
      return new Response(stream, { status: result.status, headers: responseHeaders });
    }
    const responseBody = await result.arrayBuffer();
    cleanup();
    return new Response(responseBody, { status: result.status, headers: responseHeaders });
  } catch {
    cleanup();
    return failure(502, "Codex is temporarily unavailable. Try again shortly.");
  }
}
