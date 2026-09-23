import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccountLinks,
  bankConnections,
  financeAccountSourceState,
  financeAccounts,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { toDateKey } from "@/lib/schedule/geometry";
import { linkAccount } from "@/lib/banksync/mutations";
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
      historySource: "simplefin",
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
  const [row] = await db
    .select({
      balanceCents: financeAccounts.balanceCents,
      balanceAsOf: financeAccounts.balanceAsOf,
      balanceSource: financeAccounts.balanceSource,
    })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.userId, userId), eq(financeAccounts.id, accountId)));
  return row;
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

  it("records what a file saw for a files-sourced account without deriving a headline", async () => {
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

describeDb("the headline lives on the account", () => {
  it("derives a headline for a bank-page account that has no link at all", async () => {
    const userId = await makeUser();
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Card",
        kind: "credit_card",
        externalSource: "csv:capitalone-card",
        externalKey: `k-${crypto.randomUUID()}`,
        historySource: "bank_page",
      })
      .returning({ id: financeAccounts.id });

    const result = await recordSourceState(db, userId, account.id, BROWSER);

    expect(result.headlineMoved).toBe(true);
    expect(await headline(userId, account.id)).toMatchObject({
      balanceCents: 1_600_000,
      balanceSource: "browser",
    });
  });

  it("never lets another user's write reach the headline", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const accountId = await makeLinkedAccount(owner);
    await recordSourceState(db, owner, accountId, FEED);

    const result = await recordSourceState(db, intruder, accountId, FILE);

    expect(result).toEqual({ headlineMoved: false, headlineSource: null, changes: [] });
    expect(await headline(owner, accountId)).toMatchObject({
      balanceCents: FEED.balanceCents,
      balanceSource: "feed",
    });
    expect(await headline(intruder, accountId)).toBeUndefined();
    const stamps = await loadAccountSourceStamps(db, owner, [accountId]);
    expect(stamps.get(accountId)?.file).toBeUndefined();
  });
});

describeDb("linking an account", () => {
  async function makeAccount(userId: string, historySource: "files" | "bank_page") {
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Account",
        kind: "checking",
        externalSource: "csv:capitalone-bank",
        externalKey: `k-${crypto.randomUUID()}`,
        historySource,
      })
      .returning({ id: financeAccounts.id });
    return account.id;
  }

  async function sourceOf(userId: string, accountId: string) {
    const [row] = await db
      .select({ historySource: financeAccounts.historySource })
      .from(financeAccounts)
      .where(
        and(eq(financeAccounts.userId, userId), eq(financeAccounts.id, accountId)),
      );
    return row.historySource;
  }

  async function connect(userId: string) {
    const [connection] = await db
      .insert(bankConnections)
      .values({
        userId,
        accessUrl: "https://a:b@example.test/sfin",
        label: "SimpleFIN",
      })
      .returning({ id: bankConnections.id });
    return connection.id;
  }

  it("makes the feed a file-only account's history source, and leaves a bank-page one alone", async () => {
    const userId = await makeUser();
    const connectionId = await connect(userId);
    const fileAccount = await makeAccount(userId, "files");
    const pageAccount = await makeAccount(userId, "bank_page");

    for (const accountId of [fileAccount, pageAccount]) {
      await linkAccount(userId, {
        connectionId,
        externalAccountId: `x-${crypto.randomUUID()}`,
        accountId,
      });
    }

    expect(await sourceOf(userId, fileAccount)).toBe("simplefin");
    expect(await sourceOf(userId, pageAccount)).toBe("bank_page");
  });
});

const SEP12_FEED: SourceReport = {
  source: "feed",
  balanceCents: 0,
  availableCents: null,
  asOf: new Date("2026-09-12T22:18:00Z"),
  asOfDay: null,
};
const SEP12_FILE: SourceReport = {
  source: "file",
  balanceCents: -519,
  availableCents: null,
  asOf: null,
  asOfDay: "2026-09-12",
};

async function insertPosted(
  userId: string,
  accountId: string,
  input: { description: string; amount: string; externalSource: string },
): Promise<void> {
  await db.insert(financeTransactions).values({
    userId,
    accountId,
    transactionDate: "2026-09-12",
    postedDate: "2026-09-12",
    pending: false,
    description: input.description,
    amount: input.amount,
    externalSource: input.externalSource,
    externalId: `id-${crypto.randomUUID()}`,
  });
}

describeDb("same-day file-vs-feed evidence (D5)", () => {
  it("lets the file's −$5.19 win when it holds Sep 12 Apple rows SimpleFIN does not", async () => {
    const userId = await makeUser();
    const accountId = await makeLinkedAccount(userId);
    await insertPosted(userId, accountId, {
      description: "APPLE.COM/BILL",
      amount: "-3.08",
      externalSource: "csv:capitalone-card",
    });
    await insertPosted(userId, accountId, {
      description: "APPLE.COM/BILL",
      amount: "-2.11",
      externalSource: "csv:capitalone-card",
    });

    await recordSourceState(db, userId, accountId, SEP12_FEED);
    await recordSourceState(db, userId, accountId, SEP12_FILE);

    expect(await headline(userId, accountId)).toMatchObject({
      balanceCents: -519,
      balanceSource: "file",
    });
  });

  it("lets the feed win the reverse: SimpleFIN holds that day's posted rows and the file does not", async () => {
    const userId = await makeUser();
    const accountId = await makeLinkedAccount(userId);
    await insertPosted(userId, accountId, {
      description: "SMECO",
      amount: "-263.15",
      externalSource: "api:simplefin",
    });

    await recordSourceState(db, userId, accountId, SEP12_FILE);
    await recordSourceState(db, userId, accountId, SEP12_FEED);

    expect(await headline(userId, accountId)).toMatchObject({
      balanceCents: 0,
      balanceSource: "feed",
    });
  });

  it("keeps the incumbent when both sources hold posted rows on the tied day", async () => {
    const userId = await makeUser();
    const accountId = await makeLinkedAccount(userId);
    await insertPosted(userId, accountId, {
      description: "APPLE.COM/BILL",
      amount: "-3.08",
      externalSource: "csv:capitalone-card",
    });
    await insertPosted(userId, accountId, {
      description: "SMECO",
      amount: "-263.15",
      externalSource: "api:simplefin",
    });

    await recordSourceState(db, userId, accountId, SEP12_FEED);
    await recordSourceState(db, userId, accountId, SEP12_FILE);

    expect(await headline(userId, accountId)).toMatchObject({
      balanceCents: 0,
      balanceSource: "feed",
    });
  });

  it("keeps the incumbent when neither source holds posted rows on the tied day", async () => {
    const userId = await makeUser();
    const accountId = await makeLinkedAccount(userId);

    await recordSourceState(db, userId, accountId, SEP12_FEED);
    await recordSourceState(db, userId, accountId, SEP12_FILE);

    expect(await headline(userId, accountId)).toMatchObject({
      balanceCents: 0,
      balanceSource: "feed",
    });
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

  it("does not let another user's rows decide the same-day tie, or be read, changed, or deleted", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const accountId = await makeLinkedAccount(owner);
    await recordSourceState(db, owner, accountId, SEP12_FEED);

    // Planted on the owner's account id but owned by the intruder — a dropped userId on
    // the evidence query would treat these as the file's Sep 12 Apple rows and wrongly
    // promote the file.
    await insertPosted(intruder, accountId, {
      description: "APPLE.COM/BILL",
      amount: "-3.08",
      externalSource: "csv:capitalone-card",
    });
    await insertPosted(intruder, accountId, {
      description: "APPLE.COM/BILL",
      amount: "-2.11",
      externalSource: "csv:capitalone-card",
    });

    await recordSourceState(db, owner, accountId, SEP12_FILE);
    expect(await headline(owner, accountId)).toMatchObject({
      balanceCents: 0,
      balanceSource: "feed",
    });

    expect(await loadAccountSourceStamps(db, intruder, [accountId])).toEqual(new Map());

    const result = await recordSourceState(db, intruder, accountId, {
      ...SEP12_FILE,
      balanceCents: -1,
    });
    expect(result.headlineSource).toBeNull();
    expect(await headline(owner, accountId)).toMatchObject({
      balanceCents: 0,
      balanceSource: "feed",
    });

    await db
      .delete(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, intruder),
          eq(financeTransactions.accountId, accountId),
        ),
      );
    await db
      .delete(financeAccountSourceState)
      .where(
        and(
          eq(financeAccountSourceState.userId, intruder),
          eq(financeAccountSourceState.accountId, accountId),
        ),
      );
    expect(
      (await loadAccountSourceStamps(db, owner, [accountId])).get(accountId)?.feed
        ?.asOf,
    ).toEqual(SEP12_FEED.asOf);
    expect(await headline(owner, accountId)).toMatchObject({
      balanceCents: 0,
      balanceSource: "feed",
    });
  });
});

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});
