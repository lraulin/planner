import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { linkAccount, saveBalance, saveConnection } from "@/lib/banksync/mutations";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { listAccounts, listTransactions } from "./queries";
import {
  clearScrapedPending,
  replaceScrapedPending,
  resolveScrapedPending,
} from "./scrapePending";
import { SCRAPE_FEED } from "./capitalOnePending";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("scrape pending");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `scrape-pending-${crypto.randomUUID()}@localhost`,
      name: "Scrape Pending Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

const caponeCardFile: ImportFile = {
  name: "2026-08-12_transaction_download.csv",
  text: [
    "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit",
    "2026-07-01,2026-07-02,3448,SBARRO,Dining,6.59,",
    "",
  ].join("\n"),
};

function paste(rows: string[]): string {
  return [
    "# planner-pending v1",
    "# account=3448",
    "# scraped=2026-08-16",
    "date\tdescription\tcategory\tamount",
    ...rows,
    "",
  ].join("\n");
}

describeDb("replaceScrapedPending", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    userId = await makeUser();
    await importFinanceCsvFiles({ userId, files: [caponeCardFile] });
    const [account] = await listAccounts(userId);
    accountId = account.id;
  });

  it("writes pending rows on the existing last-4 card and replaces the set", async () => {
    const first = await replaceScrapedPending(
      userId,
      paste([
        "2026-08-16\tChipotle\tDining\t16.91",
        "2026-08-16\tWalmart\tGrocery\t189.53",
      ]),
      "2026-08-16",
    );
    expect(first.accountId).toBe(accountId);
    expect(first.inserted).toBe(2);

    const second = await replaceScrapedPending(
      userId,
      paste(["2026-08-16\tChipotle\tDining\t16.91"]),
      "2026-08-16",
    );
    expect(second.inserted).toBe(1);
    expect(second.replaced).toBe(2);

    const pending = (await listTransactions(userId)).filter((row) => row.pending);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      accountId,
      description: "Chipotle",
      amountCents: -1691,
    });
  });

  it("keeps two Sheetz rows at the same amount as two rows", async () => {
    await replaceScrapedPending(
      userId,
      paste([
        "2026-08-16\tSheetz\tGas/Automotive\t24.45",
        "2026-08-16\tSheetz\tGas/Automotive\t24.45",
      ]),
      "2026-08-16",
    );
    const pending = (await listTransactions(userId)).filter((row) => row.pending);
    expect(pending).toHaveLength(2);
    expect(pending.every((row) => row.amountCents === -2445)).toBe(true);
  });

  it("does not insert a scrape row that already posted, and does not delete SimpleFIN pending", async () => {
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-16",
      pending: true,
      description: "CHASE PENDING",
      amount: "-5.00",
      externalSource: "api:simplefin",
      externalId: "sfin-1",
    });
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-15",
      pending: false,
      description: "CHIPOTLE 0123",
      amount: "-16.91",
      externalSource: "api:simplefin",
      externalId: "sfin-2",
    });

    const result = await replaceScrapedPending(
      userId,
      paste(["2026-08-16\tChipotle\tDining\t16.91"]),
      "2026-08-16",
    );
    expect(result.inserted).toBe(0);
    expect(result.skippedPosted).toBe(1);

    const rows = await listTransactions(userId);
    expect(
      rows.filter((row) => row.pending && row.description === "CHASE PENDING"),
    ).toHaveLength(1);
    expect(rows.filter((row) => row.description === "Chipotle")).toHaveLength(0);
  });

  it("does not let a second user replace the first user's scrape-pending rows", async () => {
    await replaceScrapedPending(
      userId,
      paste(["2026-08-16\tChipotle\tDining\t16.91"]),
      "2026-08-16",
    );
    const intruder = await makeUser();

    await expect(
      replaceScrapedPending(
        intruder,
        paste(["2026-08-16\tChipotle\tDining\t16.91"]),
        "2026-08-16",
      ),
    ).rejects.toThrow(/No open credit card ending in 3448/);

    const ownerPending = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.externalSource, SCRAPE_FEED),
        ),
      );
    expect(ownerPending).toHaveLength(1);

    expect(await resolveScrapedPending(intruder, [accountId])).toBe(0);
    await expect(clearScrapedPending(intruder, "2026-08-18")).rejects.toThrow(
      /no scraped pending/,
    );
    const stillThere = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.externalSource, SCRAPE_FEED),
        ),
      );
    expect(stillThere).toHaveLength(1);
  });

  it("treats a paste with no rows as clearing the snapshot", async () => {
    await replaceScrapedPending(
      userId,
      paste(["2026-08-16\tChipotle\tDining\t16.91"]),
      "2026-08-16",
    );

    const cleared = await replaceScrapedPending(
      userId,
      [
        "# planner-pending v1",
        "# account=3448",
        "# scraped=2026-08-18",
        "date\tdescription\tcategory\tamount",
        "",
      ].join("\n"),
      "2026-08-18",
    );
    expect(cleared.inserted).toBe(0);
    expect(cleared.replaced).toBe(1);
    expect((await listTransactions(userId)).filter((row) => row.pending)).toHaveLength(
      0,
    );
  });

  it("writes the scraped current as the headline so clearing pending does not revert to stale posted", async () => {
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const linkId = await linkAccount(userId, {
      connectionId,
      externalAccountId: "cap1",
      accountId,
    });
    await saveBalance(userId, {
      linkId,
      balanceCents: -5978,
      availableCents: null,
      asOf: new Date("2026-08-16T09:00:00Z"),
    });
    await replaceScrapedPending(
      userId,
      paste(["2026-08-16\tWalmart\tGrocery\t379.68"]),
      "2026-08-16",
    );

    const cleared = await replaceScrapedPending(
      userId,
      [
        "# planner-pending v1",
        "# account=3448",
        "# scraped=2026-08-18",
        "# current=439.46",
        "date\tdescription\tcategory\tamount",
        "",
      ].join("\n"),
      "2026-08-18",
    );
    expect(cleared.inserted).toBe(0);
    expect(cleared.balanceUpdated).toBe(true);

    const [account] = await listAccounts(userId);
    expect(account.balanceCents).toBe(-43946);
    expect((await listTransactions(userId)).filter((row) => row.pending)).toHaveLength(
      0,
    );

    // A same-session SimpleFIN refresh still holds yesterday's posted number.
    await saveBalance(userId, {
      linkId,
      balanceCents: -5978,
      availableCents: null,
      asOf: new Date(),
    });
    expect((await listAccounts(userId))[0].balanceCents).toBe(-43946);
  });

  it("clears leftover scrape-pending from the dashboard and folds them into the current", async () => {
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const linkId = await linkAccount(userId, {
      connectionId,
      externalAccountId: "cap1",
      accountId,
    });
    await saveBalance(userId, {
      linkId,
      balanceCents: -5978,
      availableCents: null,
      asOf: new Date("2026-08-16T09:00:00Z"),
    });
    await replaceScrapedPending(
      userId,
      paste(["2026-08-16\tWalmart\tGrocery\t379.68"]),
      "2026-08-16",
    );

    const cleared = await clearScrapedPending(userId, "2026-08-18");
    expect(cleared.inserted).toBe(0);
    expect(cleared.replaced).toBe(1);
    expect(cleared.balanceUpdated).toBe(true);
    expect((await listAccounts(userId))[0].balanceCents).toBe(-43946);
    expect((await listTransactions(userId)).filter((row) => row.pending)).toHaveLength(
      0,
    );
  });
});

describeDb("resolveScrapedPending", () => {
  it("clears one of two identical pending rows when one posted match arrives", async () => {
    const userId = await makeUser();
    await importFinanceCsvFiles({ userId, files: [caponeCardFile] });
    const [account] = await listAccounts(userId);

    await replaceScrapedPending(
      userId,
      paste([
        "2026-08-16\tSheetz\tGas/Automotive\t24.45",
        "2026-08-16\tSheetz\tGas/Automotive\t24.45",
      ]),
      "2026-08-16",
    );
    await db.insert(financeTransactions).values({
      userId,
      accountId: account.id,
      transactionDate: "2026-08-14",
      pending: false,
      description: "SHEETZ 99",
      amount: "-24.45",
      externalSource: "api:simplefin",
      externalId: "posted-sheetz",
    });

    expect(await resolveScrapedPending(userId, [account.id])).toBe(1);
    const pending = (await listTransactions(userId)).filter((row) => row.pending);
    expect(pending).toHaveLength(1);
    expect(pending[0].amountCents).toBe(-2445);
  });
});

describeDb("chase scrape pending", () => {
  it("writes scrape:chase, applies posted current, and leaves SimpleFIN pending in the register", async () => {
    const userId = await makeUser();
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Chase •••9910",
        kind: "credit_card",
        institution: "Chase",
        externalSource: "csv:chase-credit",
        externalKey: "9910",
      })
      .returning({ id: financeAccounts.id });

    const connectionId = await saveConnection(userId, {
      accessUrl: "https://a:b@x.test",
    });
    const linkId = await linkAccount(userId, {
      connectionId,
      externalAccountId: "chase",
      accountId: account.id,
    });
    await saveBalance(userId, {
      linkId,
      balanceCents: -8958,
      availableCents: null,
      asOf: new Date("2026-08-16T14:53:57Z"),
    });
    await db.insert(financeTransactions).values({
      userId,
      accountId: account.id,
      transactionDate: "2026-08-14",
      pending: true,
      description: "AMAZON MKTPLACE PMTS",
      amount: "-39.99",
      externalSource: "api:simplefin",
      externalId: "sfin-amazon",
    });

    const result = await replaceScrapedPending(
      userId,
      [
        "# planner-pending v1",
        "# account=9910",
        "# source=chase",
        "# scraped=2026-08-18",
        "# current=$148.63",
        "date\tdescription\tcategory\tamount",
        "08/18/2026\tCVS\t\t$22.84",
        "",
      ].join("\n"),
      "2026-08-18",
    );
    expect(result.inserted).toBe(1);
    expect(result.balanceUpdated).toBe(true);

    const [listed] = await listAccounts(userId);
    expect(listed.balanceCents).toBe(-14863);

    const pending = (await listTransactions(userId)).filter((row) => row.pending);
    expect(pending.map((row) => row.description).sort()).toEqual([
      "AMAZON MKTPLACE PMTS",
      "CVS",
    ]);
    expect(pending.find((row) => row.description === "CVS")?.amountCents).toBe(-2284);
  });
});
