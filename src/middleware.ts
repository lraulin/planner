import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { devAuthBypassEnabled } from "@/lib/auth/dev-bypass";

/**
 * Cookie presence gate for HTML routes. Full session validation happens in
 * `getCurrentUserId()` / Better Auth handlers — middleware only redirects guests away
 * from the app chrome.
 *
 * Allowed without a session cookie:
 * - `/login`
 * - `/api/auth/*` (Better Auth)
 * - `/api/agent/*` (Bearer key checked in the route handler)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Local development with AUTH_DEV_BYPASS: nothing to redirect to, since
  // `getCurrentUserId()` resolves the owner without a session.
  if (devAuthBypassEnabled()) return NextResponse.next();

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/agent")
  ) {
    return NextResponse.next();
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
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * All paths except Next static assets and the favicon.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
