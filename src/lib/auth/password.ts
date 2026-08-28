import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { credentialAccountFor } from "./accountKey";
import { MIN_PASSWORD_LENGTH } from "./passwordPolicy";

const WRONG_CURRENT = "Current password is incorrect.";

/**
 * Rotate the credential password for `userId`. Verifies the current password first so a
 * stolen session still needs the secret — and so a dropped `userId` cannot rewrite
 * someone else's hash (the update is scoped to that user's credential row).
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (newPassword === currentPassword) {
    throw new Error("New password must be different from the current password.");
  }

  const [row] = await db
    .select({ id: accounts.id, password: accounts.password })
    .from(accounts)
    .where(credentialAccountFor(userId))
    .limit(1);

  if (!row?.password) {
    throw new Error("This account has no password to change.");
  }

  const matches = await verifyPassword({
    hash: row.password,
    password: currentPassword,
  });
  if (!matches) {
    throw new Error(WRONG_CURRENT);
  }

  const hashed = await hashPassword(newPassword);
  const [updated] = await db
    .update(accounts)
    .set({ password: hashed, updatedAt: new Date() })
    .where(and(eq(accounts.id, row.id), eq(accounts.userId, userId)))
    .returning({ id: accounts.id });
  if (!updated) {
    throw new Error("This account has no password to change.");
  }
}
