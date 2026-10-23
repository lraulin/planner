import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { loginPathFor } from "@/lib/auth/callback-url";
import { devAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { devUserEmail, getDevUserId } from "@/lib/auth/identity";

/**
 * Current browser user from the Better Auth session.
 *
 * Every table carries a `user_id` and every query scopes by it. Callers (pages, server
 * actions) keep using this function; identity comes from the session cookie.
 *
 * Machine clients (agent API) must not use this — they resolve their own account via
 * `getAgentUserId()` after Bearer-key checks.
 *
 * With `AUTH_DEV_BYPASS` on outside production, a missing session resolves to the **dev
 * user** — a test account, not the agent/owner account. See `@/lib/auth/identity` for why
 * those are separate and `@/lib/auth/dev-bypass` for why neither can happen in a production
 * build. A real session still wins, so signing in locally behaves normally.
 *
 * With no session at all it redirects to `/login` — see `getCurrentAccount`.
 */
export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentAccount()).id;
}

export type CurrentAccount = {
  id: string;
  email: string;
  /** True when no session exists and the local bypass answered instead. */
  viaDevBypass: boolean;
};

/**
 * Who this request is acting as, and how it got there — or `null` when nobody is.
 *
 * For the callers that answer "not signed in" themselves: a route handler, which owes its
 * `fetch` a JSON 401 rather than a login page, and the root layout, which also renders
 * `/login`. Everything else wants `getCurrentAccount`.
 *
 * Request-scoped via React `cache`: layout + page + actions in one render share one session
 * lookup instead of repeating Better Auth work for every `getCurrentUserId` call.
 *
 * The `viaDevBypass` flag is the part worth having: "signed in as X" is reassuring and
 * wrong when nobody signed in at all. Surfaces that show the account should say which of
 * the two happened.
 */
export const findCurrentAccount = cache(async (): Promise<CurrentAccount | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return { id: session.user.id, email: session.user.email, viaDevBypass: false };
  }

  if (devAuthBypassEnabled()) {
    warnBypassOnce();
    return { id: await getDevUserId(), email: devUserEmail(), viaDevBypass: true };
  }

  return null;
});

/**
 * The signed-in account, or a redirect to `/login` that comes back to this page.
 *
 * The proxy only checks that a session *cookie* exists; this is where the session is
 * checked. A cookie can outlive its session — expired, revoked, signed out on another
 * device — and that request used to throw here, which a page renders as "A server error
 * occurred". A lapsed session is the expected way to meet the login screen, not an error.
 *
 * `redirect` works by throwing, so callers must not resolve the account inside a `try`
 * whose `catch` turns throws into messages: call this first, then open the `try`.
 */
export async function getCurrentAccount(): Promise<CurrentAccount> {
  const account = await findCurrentAccount();
  if (account) return account;
  redirect(loginPathFor((await headers()).get("x-pathname")));
}

let warnedAboutBypass = false;

/**
 * Say it out loud, once per server process — an app that skips login should announce it.
 *
 * The account is named because that is the part that went wrong: "the bypass is on" was
 * already being logged when the bypassed account turned out to be linked to a real Google
 * Calendar. Which account is being served is the fact worth printing.
 */
function warnBypassOnce() {
  if (warnedAboutBypass) return;
  warnedAboutBypass = true;
  console.warn(
    `[auth] AUTH_DEV_BYPASS is on — requests without a session are being served as ${devUserEmail()}. Local development only.`,
  );
}
