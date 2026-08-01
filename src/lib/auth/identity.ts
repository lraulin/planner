import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * The three identities this app resolves, and how they differ.
 *
 * 1. **Session user** — a human at `/login`. Not here; see `getCurrentUserId()`.
 * 2. **Dev user** — who the local login bypass serves. Deliberately a test account.
 * 3. **Agent user** — who a valid `PLANNER_AGENT_API_KEY` maps to.
 *
 * These were one function until multiple accounts existed, and the collapse had teeth: the
 * local bypass ran as the same account the agent API did, which was the account linked to a
 * real Google Calendar. Keeping them separate is the point of this module — the *defaults*
 * more than the configuration, since the failure was an unconfigured environment resolving
 * to something real.
 */

/**
 * Where an unconfigured dev bypass lands.
 *
 * `example.com` is reserved (RFC 2606) and passes Better Auth's email validator, unlike the
 * `dev@localhost` this project started with. The important property is that it is *not* a
 * plausible real address: an unset `AUTH_DEV_USER_EMAIL` either finds a test account or
 * finds nothing and throws. Neither outcome touches real data.
 */
export const DEFAULT_DEV_USER_EMAIL = "test@example.com";

/**
 * The one canonical form of an address in this app.
 *
 * Better Auth looks accounts up by `email.toLowerCase()` on sign-in
 * (`internalAdapter.findUserByEmail`), so a row stored with any uppercase in it can never
 * be signed into — the account exists and the password is right and the lookup still
 * misses. Everything that writes or resolves an email goes through here.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Account the local login bypass runs as. Never an owner account by default. */
export function devUserEmail(): string {
  const configured = process.env.AUTH_DEV_USER_EMAIL;
  return configured?.trim() ? normalizeEmail(configured) : DEFAULT_DEV_USER_EMAIL;
}

/**
 * Account a valid agent Bearer key maps to.
 *
 * Required in production. The previous default (`dev@example.com`) meant a deployment that
 * forgot this variable still resolved *somebody* — fine while one account existed, and a
 * silent cross-account write once more than one did. Failing the request is the safer
 * misconfiguration.
 *
 * Outside production it falls back to the dev user, so a local machine with no agent
 * configuration at all still points at the test account rather than at nothing.
 */
export function agentUserEmail(): string {
  const configured = process.env.PLANNER_AGENT_USER_EMAIL;
  if (configured?.trim()) return normalizeEmail(configured);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PLANNER_AGENT_USER_EMAIL is not set. Agent requests have no account to act as.",
    );
  }

  return devUserEmail();
}

async function userIdByEmail(email: string, role: string): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new Error(
      `${role} (${email}) not found. Create it: npm run user:create -- --email ${email} --password <password>`,
    );
  }

  return user.id;
}

/** Resolve the dev-bypass account. Throws rather than inventing one. */
export async function getDevUserId(): Promise<string> {
  return userIdByEmail(devUserEmail(), "Dev user");
}

/** Resolve the agent account without a browser session (agent API). */
export async function getAgentUserId(): Promise<string> {
  return userIdByEmail(agentUserEmail(), "Agent user");
}
