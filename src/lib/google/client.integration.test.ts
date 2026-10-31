import { expect, it } from "vitest";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { CREDENTIAL_ISSUER } from "@/lib/auth/accountKey";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { getGoogleAccessToken, googleAccountId, GoogleNotLinkedError } from "./client";

/**
 * `getGoogleAccessToken` resolves the Better Auth account row itself since 1.7, which
 * replaced `providerId` with the account's row id. That turned a provider-name lookup into
 * a database read, and a database read that takes a `userId` is one that can drop it.
 *
 * The refresh itself is not testable here — it needs a live Google grant. What is testable,
 * and what a dropped `where` clause would break, is *which* row the lookup is allowed to
 * find.
 */

const describeDb = await describeWithDatabase("google access token");

const makeUser = testUsers("test");

/**
 * Stand in for a completed OAuth link — the row Better Auth would have written. No `issuer`:
 * Better Auth 1.7.3 and later leave it null, so Google code must not depend on it.
 */
async function linkGoogle(userId: string): Promise<string> {
  const [account] = await db
    .insert(accounts)
    .values({
      userId,
      accountId: `google-${crypto.randomUUID()}`,
      providerId: "google",
      accessToken: "token",
    })
    .returning({ id: accounts.id });
  return account.id;
}

describeDb("googleAccountId", () => {
  it("finds the user's own google account", async () => {
    const userId = await makeUser();
    const linked = await linkGoogle(userId);

    expect(await googleAccountId(userId)).toBe(linked);
  });

  it("is null for a user who never linked google", async () => {
    expect(await googleAccountId(await makeUser())).toBeNull();
  });

  it("does not return another user's google account", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    await linkGoogle(owner);

    // Unscoped, this hands the stranger the owner's account id and Better Auth then
    // refreshes a token against the owner's Google grant.
    expect(await googleAccountId(stranger)).toBeNull();
  });

  it("ignores a non-google account belonging to the same user", async () => {
    const userId = await makeUser();
    // Every password user has one of these; matching on userId alone would pick it up.
    await db.insert(accounts).values({
      userId,
      accountId: userId,
      providerId: "credential",
      issuer: CREDENTIAL_ISSUER,
      password: "hash",
    });

    expect(await googleAccountId(userId)).toBeNull();
  });
});

describeDb("getGoogleAccessToken", () => {
  it("reports not-linked for a user with no google account", async () => {
    const userId = await makeUser();
    await expect(getGoogleAccessToken(userId)).rejects.toBeInstanceOf(
      GoogleNotLinkedError,
    );
  });
});
