import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * `getGoogleAccessToken` is called from inside Bearer-authenticated requests — the MCP
 * endpoint and the agent HTTP API — as well as from browser sessions and scripts. It once
 * forwarded the inbound request headers to Better Auth, which answers any call that carries
 * headers but no session cookie with UNAUTHORIZED. Every Google write-through from MCP
 * therefore failed as "Google is not connected." and surfaced as a bare "Internal error".
 *
 * This file stands in a request scope that carries exactly what an MCP call carries — a
 * Bearer token and no cookie — and needs the Google provider configured so Better Auth gets
 * as far as the token. Both have to be in place before `@/lib/auth/server` is imported.
 */
const requestScope = vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID ||= "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET ||= "test-client-secret";
  return { headers: new Headers({ authorization: "Bearer p1.mcp-access-token" }) };
});
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestScope.headers),
  cookies: () => Promise.resolve(new Map()),
}));

const { db } = await import("@/db");
const { accounts, users } = await import("@/db/schema");
const { databaseReachable, warnDatabaseSkipped } =
  await import("@/lib/testing/database");
const { getGoogleAccessToken } = await import("./client");

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("google access token in a bearer request");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

// No `issuer`: Better Auth 1.7.3 and later leave it null on the rows they write.
async function linkGoogle(userId: string, accessToken: string): Promise<void> {
  await db.insert(accounts).values({
    userId,
    accountId: `google-${crypto.randomUUID()}`,
    providerId: "google",
    accessToken,
  });
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("getGoogleAccessToken inside a Bearer-authenticated request", () => {
  it("returns the linked user's token although the request has no session cookie", async () => {
    const userId = await makeUser();
    await linkGoogle(userId, "owner-token");

    await expect(getGoogleAccessToken(userId)).resolves.toBe("owner-token");
  });

  it("still returns only the named user's token", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    await linkGoogle(owner, "owner-token");
    await linkGoogle(stranger, "stranger-token");

    await expect(getGoogleAccessToken(stranger)).resolves.toBe("stranger-token");
    await expect(getGoogleAccessToken(owner)).resolves.toBe("owner-token");
  });
});
