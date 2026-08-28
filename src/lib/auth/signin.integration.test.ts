import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { CREDENTIAL_ISSUER, credentialAccountFor } from "./accountKey";
import { changePassword } from "./password";
import { createCredentialUser, upsertUser } from "./provision";

/**
 * The one thing the rest of the auth suite never did: sign in.
 *
 * Every other test here asserts on the stored hash, and `verifyPassword` is happy with a
 * row Better Auth will not look at. That is how a provisioned account could be perfectly
 * correct by every existing assertion and still answer "Invalid email or password" at the
 * login form — the accounts table had no `issuer`, which Better Auth 1.7 matches on.
 *
 * So these go through `auth.api.signInEmail`, the same call the login form makes. They
 * fail if the issuer we write ever stops being the one Better Auth looks for, whichever
 * side moved.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("credential sign-in");

const createdUserIds: string[] = [];
const PASSWORD = "password12345678";

function freshEmail(label: string): string {
  return `signin-${label}-${crypto.randomUUID()}@example.com`;
}

async function signIn(email: string, password: string): Promise<string> {
  const result = await auth.api.signInEmail({ body: { email, password } });
  return result.user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("credential sign-in", () => {
  it("signs in an account provisioned by user:create", async () => {
    const email = freshEmail("upsert");
    const user = await upsertUser({ email, password: PASSWORD });
    createdUserIds.push(user.id);

    await expect(signIn(email, PASSWORD)).resolves.toBe(user.id);
  });

  it("signs in an account created by redeeming an invite", async () => {
    const email = freshEmail("invite");
    const user = await createCredentialUser({ email, password: PASSWORD });
    createdUserIds.push(user.id);

    await expect(signIn(email, PASSWORD)).resolves.toBe(user.id);
  });

  it("stamps the issuer Better Auth matches credential rows on", async () => {
    const email = freshEmail("issuer");
    const user = await upsertUser({ email, password: PASSWORD });
    createdUserIds.push(user.id);

    const [row] = await db
      .select({ issuer: accounts.issuer, accountId: accounts.accountId })
      .from(accounts)
      .where(credentialAccountFor(user.id));

    expect(row.issuer).toBe(CREDENTIAL_ISSUER);
    // Better Auth keys the account by (issuer, accountId); for credentials that subject is
    // the user's own id, which is what makes the pair unique per account.
    expect(row.accountId).toBe(user.id);
  });

  it("still signs in after a password rotation, with the new password only", async () => {
    const email = freshEmail("rotate");
    const user = await upsertUser({ email, password: PASSWORD });
    createdUserIds.push(user.id);

    await changePassword(user.id, PASSWORD, "brandnewpassword1");

    await expect(signIn(email, "brandnewpassword1")).resolves.toBe(user.id);
    await expect(signIn(email, PASSWORD)).rejects.toThrow(/invalid email or password/i);
  });

  it("refuses the wrong password", async () => {
    const email = freshEmail("wrong");
    const user = await upsertUser({ email, password: PASSWORD });
    createdUserIds.push(user.id);

    await expect(signIn(email, "not-the-password")).rejects.toThrow(
      /invalid email or password/i,
    );
  });

  it("will not sign one account in with another account's password", async () => {
    const ownerEmail = freshEmail("owner");
    const owner = await upsertUser({ email: ownerEmail, password: PASSWORD });
    const other = await upsertUser({
      email: freshEmail("other"),
      password: "adifferentpassword1",
    });
    createdUserIds.push(owner.id, other.id);

    await expect(signIn(ownerEmail, "adifferentpassword1")).rejects.toThrow(
      /invalid email or password/i,
    );
    await expect(signIn(ownerEmail, PASSWORD)).resolves.toBe(owner.id);
  });
});
