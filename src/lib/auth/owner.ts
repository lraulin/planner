import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Legacy pre-auth seed email. Better Auth rejects bare `*.localhost` addresses, so we
 * migrate this row to `seedEmail()` when seeding.
 */
export const LEGACY_DEV_USER_EMAIL = "dev@localhost";

/** Email used when seeding / rotating the owner password. */
export function seedEmail(): string {
  // example.com is reserved and passes Better Auth's email validator (unlike @localhost).
  return process.env.AUTH_SEED_EMAIL?.trim() || "dev@example.com";
}

/**
 * Email of the personal owner account for agent API identity (and seed default).
 * Prefer PLANNER_AGENT_USER_EMAIL when agents should target a specific account.
 */
export function ownerEmail(): string {
  return process.env.PLANNER_AGENT_USER_EMAIL?.trim() || seedEmail();
}

/**
 * Resolve the owner user id without a browser session (seed, agent API).
 */
export async function getOwnerUserId(): Promise<string> {
  const email = ownerEmail();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new Error(
      `Owner user (${email}) not found. Run: npm run db:seed (or set AUTH_SEED_EMAIL).`,
    );
  }

  return user.id;
}
