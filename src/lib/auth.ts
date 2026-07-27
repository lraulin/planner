import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * The single seeded account used until real authentication lands.
 *
 * Every table carries a `user_id` and every query scopes by it, so turning on multi-user
 * support means replacing the body of `getCurrentUserId()` with a session lookup — no
 * schema migration and no changes to callers.
 */
export const DEV_USER_EMAIL = "dev@localhost";

export async function getCurrentUserId(): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEV_USER_EMAIL))
    .limit(1);

  if (!user) {
    throw new Error(`Dev user (${DEV_USER_EMAIL}) not found. Run: npm run db:seed`);
  }

  return user.id;
}
