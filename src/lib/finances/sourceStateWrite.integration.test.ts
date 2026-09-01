import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccountLinks,
  bankConnections,
  financeAccountSourceState,
  financeAccounts,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { toDateKey } from "@/lib/schedule/geometry";
import {
  loadAccountSourceStamps,
  recordSourceState,
  type SourceReport,
} from "./sourceStateWrite";

/**
 * Integration tests for the one writer of the derived headline.
 *
 * The point of the file is the **out-of-order** block: the workflow alternates three
 * sources deliberately, so the property that has to hold is that no ordering of the same
 * three reports produces a different headline, and that the headline never goes backwards.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("source state");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

/** A linked account, so there is a headline for the sources to compete over. */
async function makeLinkedAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "360 Checking",
      kind: "checking",
      externalSource: "csv:capitalone-bank",
      externalKey: `k-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  const [connection] = await db
    .insert(bankConnections)
    .values({ userId, accessUrl: "https://a:b@example.test/sfin", label: "SimpleFIN" })
    .returning({ id: bankConnections.id });
  await db.insert(bankAccountLinks).values({
    userId,
    connectionId: connection.id,
    externalAccountId: `x-${crypto.randomUUID()}`,
    accountId: account.id,
  });
  return account.id;
}

async function headline(userId: string, accountId: string) {
  const [link] = await db
    .select({
      balanceCents: bankAccountLinks.balanceCents,
      balanceAsOf: bankAccountLinks.balanceAsOf,
      balanceSource: bankAccountLinks.balanceSource,
    })
    .from(bankAccountLinks)
    .where(
      and(
        eq(bankAccountLinks.userId, userId),
        eq(bankAccountLinks.accountId, accountId),
      ),
    );
  return link;
}

const FEED: SourceReport = {
  source: "feed",
  balanceCents: 1_125_746,
  availableCents: 1_100_000,
  asOf: new Date("2026-08-25T09:00:00Z"),
  asOfDay: null,
};
const BROWSER: SourceReport = {
  source: "browser",
  balanceCents: 1_600_000,
  availableCents: null,
  asOf: new Date("2026-08-29T18:00:00Z"),
  asOfDay: null,
};
const FILE: SourceReport = {
  source: "file",
  balanceCents: 1_625_746,
  availableCents: null,
  asOf: null,
  asOfDay: "2026-08-31",
};

/** Every ordering of three reports. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

describeDb("recordSourceState", () => {
  it("derives the headline from the freshest source whatever order they arrive in", async () => {
    const userId = await makeUser();
    for (const order of permutations([FEED, BROWSER, FILE])) {
      const accountId = await makeLinkedAccount(userId);
      for (const report of order) {
        await recordSourceState(db, userId, accountId, report);
      }
      const link = await headline(userId, accountId);
      expect({
        order: order.map((report) => report.source).join(">"),
        cents: link.balanceCents,
        source: link.balanceSource,
      }).toEqual({
        order: order.map((report) => report.source).join(">"),
        cents: 1_625_746,
        source: "file",
      });
      // The file only knows a day, so it materializes as UTC noon of that day.
      expect(toDateKey(link.balanceAsOf!)).toBe("2026-08-31");
    }
  });

  it("never lets the headline's as-of go backwards across a mixed sequence", async () => {
    const userId = await makeUser();
    const accountId = await makeLinkedAccount(userId);
    const sequence: SourceReport[] = [
      BROWSER,
      FEED,
      FILE,
      { ...BROWSER, asOf: new Date("2026-08-20T18:00:00Z"), balanceCents: 1 },
      { ...FEED, asOf: new Date("2026-08-01T09:00:00Z"), balanceCents: 2 },
      { ...FILE, asOfDay: "2026-07-31", balanceCents: 3 },
      { ...FEED, asOf: null, balanceCents: 4 },
    ];
    let previous = "";
    for (const report of sequence) {
      await recordSourceState(db, userId, accountId, report);
      const key = toDateKey((await headline(userId, accountId)).balanceAsOf!);
      expect(key >= previous).toBe(true);
      previous = key;
    }
    const link = await headline(userId, accountId);
    expect(link.balanceCents).toBe(1_625_746);
    expect(link.balanceSource).toBe("file");
  });

  it("reports that a stale source did not take the headline, and still stores its figure", async () => {
    const userId = await makeUser();
    const accountId = await makeLinkedAccount(userId);
    await recordSourceState(db, userId, accountId, FILE);

    const result = await recordSourceState(db, userId, accountId, FEED);
    expect(result.headlineMoved).toBe(false);
    expect(result.headlineSource).toBe("file");
    expect(result.changes).toEqual([]);

    // D4: the source's own row is still written, so the next comparison has real evidence.
    const stamps = await loadAccountSourceStamps(db, userId, [accountId]);
    expect(stamps.get(accountId)?.feed?.asOf).toEqual(FEED.asOf);
  });

  it("does not walk a source's own stamp back when it re-reports something older", async () => {
    const userId = await makeUser();
    const accountId = await makeLinkedAccount(userId);
    await recordSourceState(db, userId, accountId, BROWSER);

    // Re-pasting yesterday's clipboard. The row records what the browser last knew.
    const result = await recordSourceState(db, userId, accountId, {
      ...BROWSER,
      asOf: new Date("2026-08-28T18:00:00Z"),
      balanceCents: 999,
    });
    expect(result.headlineMoved).toBe(false);
    const link = await headline(userId, accountId);
    expect(link.balanceCents).toBe(BROWSER.balanceCents);
    expect(link.balanceAsOf).toEqual(BROWSER.asOf);
  });

  it("records what a file saw for an account with no bank link at all", async () => {
    const userId = await makeUser();
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Unlinked",
        kind: "checking",
        externalSource: "csv:capitalone-bank",
        externalKey: `k-${crypto.randomUUID()}`,
      })
      .returning({ id: financeAccounts.id });

    const result = await recordSourceState(db, userId, account.id, FILE);
    expect(result).toEqual({ headlineMoved: false, headlineSource: null, changes: [] });
    const stamps = await loadAccountSourceStamps(db, userId, [account.id]);
    expect(stamps.get(account.id)?.file?.asOfDay).toBe("2026-08-31");
  });
});

describeDb("cross-user isolation", () => {
  it("refuses to read, change or delete another user's source state", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const accountId = await makeLinkedAccount(owner);
    await recordSourceState(db, owner, accountId, BROWSER);

    // Read: the intruder's own view of the same account id is empty.
    expect(await loadAccountSourceStamps(db, intruder, [accountId])).toEqual(new Map());
    expect((await loadAccountSourceStamps(db, intruder)).size).toBe(0);

    // Change: writing under the intruder's id creates the intruder's own row and leaves the
    // owner's alone — and moves no headline, because the account is not theirs to hold.
    const result = await recordSourceState(db, intruder, accountId, {
      ...BROWSER,
      asOf: new Date("2026-09-30T18:00:00Z"),
      balanceCents: 1,
    });
    expect(result.headlineSource).toBeNull();
    expect(
      (await loadAccountSourceStamps(db, owner, [accountId])).get(accountId)?.browser
        ?.asOf,
    ).toEqual(BROWSER.asOf);
    expect(await headline(owner, accountId)).toMatchObject({
      balanceCents: BROWSER.balanceCents,
      balanceSource: "browser",
    });

    // Delete: a delete scoped to the intruder removes nothing of the owner's.
    await db
      .delete(financeAccountSourceState)
      .where(
        and(
          eq(financeAccountSourceState.userId, intruder),
          eq(financeAccountSourceState.accountId, accountId),
        ),
      );
    expect(
      (await loadAccountSourceStamps(db, owner, [accountId])).get(accountId)?.browser
        ?.asOf,
    ).toEqual(BROWSER.asOf);
  });
});

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});
