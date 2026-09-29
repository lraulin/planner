import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/constraints";
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
 * login form — the accounts table had no `issuer`, which Better Auth 1.7.0–1.7.2 matched on.
 * The reverse break followed: 1.7.3 stopped writing `issuer` and refused every auth request
 * while the column was NOT NULL.
 *
 * So these go through `auth.api.signInEmail`, the same call the login form makes. They
 * fail if the row we write ever stops being one Better Auth will sign in with, or if the
 * schema stops being one it will run against, whichever side moved.
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

  it("writes the credential row under the key Better Auth looks it up by", async () => {
    const email = freshEmail("key");
    const user = await upsertUser({ email, password: PASSWORD });
    createdUserIds.push(user.id);

    const rows = await db
      .select({
        providerId: accounts.providerId,
        accountId: accounts.accountId,
        issuer: accounts.issuer,
      })
      .from(accounts)
      .where(eq(accounts.userId, user.id));

    // Better Auth keys the account by (providerId, accountId); for credentials that subject
    // is the user's own id, which is what makes the pair unique per account.
    expect(rows).toEqual([
      { providerId: "credential", accountId: user.id, issuer: CREDENTIAL_ISSUER },
    ]);
  });

  it("finds that row through credentialAccountFor, and only for its owner", async () => {
    const owner = await upsertUser({
      email: freshEmail("pred-owner"),
      password: PASSWORD,
    });
    const other = await upsertUser({
      email: freshEmail("pred-other"),
      password: PASSWORD,
    });
    createdUserIds.push(owner.id, other.id);

    const found = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(credentialAccountFor(owner.id));

    expect(found).toEqual([{ userId: owner.id }]);
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

describeDb("account identity", () => {
  it("refuses a second account row under the same provider and subject", async () => {
    const first = await upsertUser({ email: freshEmail("dup-a"), password: PASSWORD });
    const second = await upsertUser({ email: freshEmail("dup-b"), password: PASSWORD });
    createdUserIds.push(first.id, second.id);
    const subject = `google-${crypto.randomUUID()}`;

    await db
      .insert(accounts)
      .values({ userId: first.id, providerId: "google", accountId: subject });

    // Better Auth resolves an OAuth sign-in or link by (providerId, accountId) and rejects
    // the lookup when two rows match, so the database must never hold the second one —
    // whichever user it would belong to.
    const duplicate = await db
      .insert(accounts)
      .values({ userId: second.id, providerId: "google", accountId: subject })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(isUniqueViolation(duplicate)).toBe(true);
  });
});
