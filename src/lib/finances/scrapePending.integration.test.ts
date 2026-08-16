import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { listAccounts, listTransactions } from "./queries";
import { replaceScrapedPending, resolveScrapedPending } from "./scrapePending";
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
