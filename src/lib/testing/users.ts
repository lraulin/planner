import { inArray } from "drizzle-orm";
import { afterAll } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Throwaway users for one integration-test file. Returns `makeUser`, which inserts a fresh
 * user and resolves to its id; every user it made is deleted after the file's tests, and
 * their rows go with them by cascade.
 *
 * Call it once at module scope, where it registers that `afterAll`. The cross-user check
 * the testing standard asks for is two calls: `owner = await makeUser()`, then
 * `intruder = await makeUser()`.
 *
 * Kept apart from `database.ts`, which unit tests may import: this one loads `@/db`.
 */
export function testUsers(prefix: string): (name?: string) => Promise<string> {
  const created: string[] = [];
  afterAll(async () => {
    if (created.length > 0) await db.delete(users).where(inArray(users.id, created));
  });
  return async (name = "Test User") => {
    const [user] = await db
      .insert(users)
      .values({ email: `${prefix}-${crypto.randomUUID()}@localhost`, name })
      .returning({ id: users.id });
    created.push(user.id);
    return user.id;
  };
}
