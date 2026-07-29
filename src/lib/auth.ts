import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

/**
 * Current browser user from the Better Auth session.
 *
 * Every table carries a `user_id` and every query scopes by it. Callers (pages, server
 * actions) keep using this function; identity now comes from the session cookie.
 *
 * Machine clients (agent API) must not use this — they resolve the owner via
 * `getOwnerUserId()` after Bearer-key checks.
 */
export async function getCurrentUserId(): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized: no session. Sign in at /login.");
  }

  return session.user.id;
}

/** @deprecated Prefer seedEmail() from `@/lib/auth/owner`. */
export { LEGACY_DEV_USER_EMAIL as DEV_USER_EMAIL, seedEmail } from "@/lib/auth/owner";
