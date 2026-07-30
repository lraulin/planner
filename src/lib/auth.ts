import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { devAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { getOwnerUserId } from "@/lib/auth/owner";

/**
 * Current browser user from the Better Auth session.
 *
 * Every table carries a `user_id` and every query scopes by it. Callers (pages, server
 * actions) keep using this function; identity now comes from the session cookie.
 *
 * Machine clients (agent API) must not use this — they resolve the owner via
 * `getOwnerUserId()` after Bearer-key checks.
 *
 * With `AUTH_DEV_BYPASS` on outside production, a missing session resolves to the owner
 * account instead of throwing. See `@/lib/auth/dev-bypass` for why that cannot happen in
 * a production build. A real session still wins, so signing in locally behaves normally.
 */
export async function getCurrentUserId(): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    if (devAuthBypassEnabled()) {
      warnBypassOnce();
      return getOwnerUserId();
    }
    throw new Error("Unauthorized: no session. Sign in at /login.");
  }

  return session.user.id;
}

let warnedAboutBypass = false;

/** Say it out loud, once per server process — an app that skips login should announce it. */
function warnBypassOnce() {
  if (warnedAboutBypass) return;
  warnedAboutBypass = true;
  console.warn(
    "[auth] AUTH_DEV_BYPASS is on — requests without a session are being served as the owner account. Local development only.",
  );
}

/** @deprecated Prefer seedEmail() from `@/lib/auth/owner`. */
export { LEGACY_DEV_USER_EMAIL as DEV_USER_EMAIL, seedEmail } from "@/lib/auth/owner";
