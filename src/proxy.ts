import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { devAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { buildCsp, createNonce } from "@/lib/security/csp";

/**
 * Two jobs, in this order: attach a per-request CSP nonce, then decide whether this request
 * is allowed past the login gate.
 *
 * **Auth.** Cookie presence only. Full session validation happens in `getCurrentUserId()` /
 * Better Auth handlers — this just redirects guests away from the app chrome. That
 * redundancy is deliberate and must stay: a proxy that is the *only* auth check is the
 * shape that Next's middleware-bypass CVE class (CVE-2025-29927) turned into an
 * authentication bypass. Here the authority is always server-side, per request.
 *
 * Allowed without a session cookie:
 * - `/login`
 * - `/api/auth/*` (Better Auth)
 * - `/api/agent/*` and `/api/mcp` (Bearer key checked in the route handler)
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV !== "production" });

  // Next.js discovers the nonce by parsing the CSP off the *request* headers during
  // render, which is how it gets applied to the framework and bundle script tags without
  // us touching a single <script>. Setting it only on the response would ship a policy
  // whose nonce nothing on the page carries — a blank screen, not a soft failure.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);

  const withCsp = <T extends NextResponse>(response: T): T => {
    response.headers.set("content-security-policy", csp);
    return response;
  };

  const proceed = () =>
    withCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  const { pathname } = request.nextUrl;

  // Local development with AUTH_DEV_BYPASS: nothing to redirect to, since
  // `getCurrentUserId()` resolves the owner without a session.
  if (devAuthBypassEnabled()) return proceed();

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/agent") ||
    pathname.startsWith("/api/mcp")
  ) {
    return proceed();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const returnTo = pathname + request.nextUrl.search;
    if (returnTo && returnTo !== "/") {
      loginUrl.searchParams.set("callbackUrl", returnTo);
    }
    return withCsp(NextResponse.redirect(loginUrl));
  }

  return proceed();
}

export const config = {
  matcher: [
    /*
     * All paths except Next static assets, favicon, and PWA install assets
     * (manifest + icons must load without a session so Chrome can install).
     *
     * The Next.js CSP guide suggests also excluding `next/link` prefetches. Not done here:
     * this matcher is the auth gate as well as the header pass, and narrowing it to save a
     * header on prefetches would trade a real property for a trivial one.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest\\.webmanifest|sw\\.js).*)",
  ],
};
