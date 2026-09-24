import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccountLinks,
  financeAccounts,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { linkAccount, saveConnection } from "@/lib/banksync/mutations";
import { writeFinanceAuditEvent } from "./audit/writes";
import {
  PLANNER_BANK_SNAPSHOT_HEADER,
  type BankBrowserSnapshotV1,
} from "./bankSnapshot";
import { applyHistorySourceCutover } from "./historySourceCutover";
import { seedBudget } from "./budget/mutations";
import { loadBudget } from "./budget/queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("history source cutover");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `cutover-test-${crypto.randomUUID()}@localhost`,
      name: "Cutover Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

type Row = {
  source: string;
  date: string;
  posted?: string;
  description: string;
  amount: string;
  pending?: boolean;
  notes?: string;
  budgetCategoryId?: string;
};

/** A Capital One card fed by SimpleFIN, with the page's rows beside it — the state before cutover. */
async function linkedCard(userId: string, rows: Row[]): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Capital One •••3448",
      kind: "credit_card",
      institution: "Capital One",
      externalSource: "csv:capitalone-card",
      externalKey: crypto.randomUUID(),
    })
    .returning({ id: financeAccounts.id });
  const connectionId = await saveConnection(userId, {
    accessUrl: `https://a:b@${crypto.randomUUID()}.test`,
  });
  await linkAccount(userId, {
    connectionId,
    externalAccountId: `sfin-${crypto.randomUUID()}`,
    accountId: account.id,
  });
  await db.insert(financeTransactions).values(
    rows.map((row) => ({
      userId,
      accountId: account.id,
      transactionDate: row.date,
      postedDate: row.pending ? null : (row.posted ?? row.date),
      description: row.description,
      amount: row.amount,
      pending: row.pending ?? false,
      notes: row.notes ?? "",
      budgetCategoryId: row.budgetCategoryId ?? null,
      externalSource: row.source,
      externalId: crypto.randomUUID(),
    })),
  );
  return account.id;
}

const history: Row[] = [
  {
    source: "api:simplefin",
    date: "2026-09-10",
    description: "SHEETZ",
    amount: "-30.00",
  },
  {
    source: "api:simplefin",
    date: "2026-09-19",
    posted: "2026-09-20",
    description: "YOUTUBE",
    amount: "-13.99",
  },
  // The same hold told by both sources; the SimpleFIN copy carries Lee's note.
  {
    source: "api:simplefin",
    date: "2026-09-22",
    description: "KIMS NAILS III",
    amount: "-50.00",
    pending: true,
    notes: "birthday",
  },
  {
    source: "scrape:capitalone",
    date: "2026-09-22",
    description: "KIMS NAILS III",
    amount: "-50.00",
    pending: true,
  },
  // A SimpleFIN hold the page never listed.
  {
    source: "api:simplefin",
    date: "2026-09-21",
    description: "MYSTERY HOLD",
    amount: "-7.00",
    pending: true,
  },
];

async function rowsOf(userId: string, accountId: string) {
  return db
    .select({
      description: financeTransactions.description,
      externalSource: financeTransactions.externalSource,
      notes: financeTransactions.notes,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
      ),
    );
}

async function accountOf(accountId: string) {
  const [account] = await db
    .select({
      historySource: financeAccounts.historySource,
      since: financeAccounts.historySourceSince,
    })
    .from(financeAccounts)
    .where(eq(financeAccounts.id, accountId));
  const links = await db
    .select({ id: bankAccountLinks.id })
    .from(bankAccountLinks)
    .where(eq(bankAccountLinks.accountId, accountId));
  return { ...account, links: links.length };
}

describeDb("history source cutover", () => {
  it("hands the card to the page after SimpleFIN's last posted day and retires its holds", async () => {
    const owner = await makeUser();
    const accountId = await linkedCard(owner, history);

    const receipt = await applyHistorySourceCutover(owner, accountId, "bank_page", {
      dryRun: false,
    });

    expect(receipt).toMatchObject({
      from: "simplefin",
      since: "2026-09-20",
      retired: 1,
      carried: 1,
      unlinked: 1,
    });
    expect(receipt.unpaired.map((row) => row.description)).toEqual(["MYSTERY HOLD"]);
    expect(await accountOf(accountId)).toEqual({
      historySource: "bank_page",
      since: "2026-09-20",
      links: 0,
    });

    const rows = await rowsOf(owner, accountId);
    const nails = rows.filter((row) => row.description === "KIMS NAILS III");
    expect(nails).toEqual([
      {
        description: "KIMS NAILS III",
        externalSource: "scrape:capitalone",
        notes: "birthday",
      },
    ]);
    // SimpleFIN's posted history stays exactly as it was.
    expect(rows.filter((row) => row.externalSource === "api:simplefin")).toHaveLength(
      3,
    );
  });

  it("leaves every envelope where it was and moves Ready to Assign only by the unpaired holds", async () => {
    const owner = await makeUser();
    await seedBudget(owner, {
      preset: "minimal",
      startMonth: "2026-09-01",
      todayKey: "2026-09-23",
    });
    const [envelope] = (
      await db
        .select({ id: financeBudgetCategories.id, kind: financeBudgetCategories.kind })
        .from(financeBudgetCategories)
        .where(eq(financeBudgetCategories.userId, owner))
    ).filter((category) => category.kind !== "income");
    // Lee's envelope is on SimpleFIN's copy of the hold, the copy the cutover deletes.
    const accountId = await linkedCard(
      owner,
      history.map((row) =>
        row.source === "api:simplefin" &&
        row.pending &&
        row.description === "KIMS NAILS III"
          ? { ...row, budgetCategoryId: envelope.id }
          : row,
      ),
    );
    const month = async () => {
      const budget = await loadBudget(owner, "2026-09-01");
      const found = budget.months.find((m) => m.month === "2026-09-01")!;
      return { rta: found.readyToAssignCents, envelope: found.categories[envelope.id] };
    };
    const before = await month();

    const receipt = await applyHistorySourceCutover(owner, accountId, "bank_page", {
      dryRun: false,
    });

    expect(receipt.retired).toBe(1);
    // The envelope moved with the hold. The one change is the unpaired SimpleFIN hold
    // (MYSTERY HOLD, -$7.00, uncategorized): it is no longer this card's source, so it stops
    // counting, and the receipt lists it for exactly that reason.
    expect(receipt.unpaired.map((row) => row.amountCents)).toEqual([-700]);
    expect(await month()).toEqual({ ...before, rta: before.rta + 700 });
  });

  it("changes nothing on a dry run, while reporting what the apply would do", async () => {
    const owner = await makeUser();
    const accountId = await linkedCard(owner, history);
    const before = await rowsOf(owner, accountId);

    const receipt = await applyHistorySourceCutover(owner, accountId, "bank_page", {
      dryRun: true,
    });

    expect(receipt).toMatchObject({ since: "2026-09-20", retired: 1, unlinked: 1 });
    expect(await accountOf(accountId)).toEqual({
      historySource: "simplefin",
      since: null,
      links: 1,
    });
    expect(await rowsOf(owner, accountId)).toEqual(before);
  });

  it("refuses another user's account and never touches its rows or link", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const accountId = await linkedCard(owner, history);
    const before = await rowsOf(owner, accountId);

    await expect(
      applyHistorySourceCutover(intruder, accountId, "bank_page", { dryRun: false }),
    ).rejects.toThrow(/Account not found/);

    // The intruder's own cutover leaves the owner's matching holds alone too.
    const intruderAccount = await linkedCard(intruder, history);
    await applyHistorySourceCutover(intruder, intruderAccount, "bank_page", {
      dryRun: false,
    });

    expect(await accountOf(accountId)).toEqual({
      historySource: "simplefin",
      since: null,
      links: 1,
    });
    expect(await rowsOf(owner, accountId)).toEqual(before);
  });

  it("lists the latest capture's posted rows on or before the cutover that nothing stores", async () => {
    const owner = await makeUser();
    const accountId = await linkedCard(owner, history);
    const row = (transactionDate: string, description: string, amount: string) => ({
      transactionDate,
      postedDate: transactionDate,
      description,
      category: "Merchandise",
      amount,
    });
    const body: BankBrowserSnapshotV1 = {
      version: 1,
      source: "capitalone",
      capturedAt: "2026-09-23T15:00:00.000Z",
      accountLast4: "3448",
      balanceKind: "posted_only",
      currentBalance: "$500.00",
      completeness: {
        currentCycle: true,
        posted: true,
        pending: true,
        filtered: false,
        searched: false,
      },
      posted: [
        row("Sep 10, 2026", "Sheetz", "$30.00"),
        row("Sep 15, 2026", "Missed By SimpleFIN", "$4.00"),
        row("Sep 22, 2026", "After Cutover", "$9.00"),
      ],
      pending: [],
    };
    await db.transaction((tx) =>
      writeFinanceAuditEvent(tx, owner, {
        kind: "bank_snapshot",
        origin: "Capital One browser",
        summary: "fixture",
        scope: { accountIds: [accountId] },
        sourceEvidence: {
          format: "planner-bank-snapshot-v1",
          rawText: `${PLANNER_BANK_SNAPSHOT_HEADER}\n${JSON.stringify(body)}\n`,
        },
      }),
    );

    const receipt = await applyHistorySourceCutover(owner, accountId, "bank_page", {
      dryRun: true,
    });

    // Sheetz is SimpleFIN's; the Sep 22 row is after the cutover, so the next paste writes it.
    expect(receipt.missedByPreviousSource.map((r) => r.description)).toEqual([
      "Missed By SimpleFIN",
    ]);
    expect(receipt.insertedMissed).toBe(0);

    const applied = await applyHistorySourceCutover(owner, accountId, "bank_page", {
      dryRun: false,
      insertMissed: true,
    });
    expect(applied.insertedMissed).toBe(1);
    const inserted = (await rowsOf(owner, accountId)).filter(
      (r) => r.description === "Missed By SimpleFIN",
    );
    expect(inserted).toEqual([
      {
        description: "Missed By SimpleFIN",
        externalSource: "scrape:capitalone",
        notes: "",
      },
    ]);
  });

  it("keeps a feed account on SimpleFIN and retires the page's leftover holds onto it", async () => {
    const owner = await makeUser();
    const accountId = await linkedCard(owner, [
      {
        source: "api:simplefin",
        date: "2026-09-18",
        description: "AMAZON MKTPL",
        amount: "-10.59",
      },
      {
        source: "scrape:chase",
        date: "2026-09-18",
        description: "AMAZON MKTPL",
        amount: "-10.59",
        pending: true,
        notes: "gift",
      },
    ]);

    const receipt = await applyHistorySourceCutover(owner, accountId, "simplefin", {
      dryRun: false,
    });

    expect(receipt).toMatchObject({
      retired: 1,
      carried: 1,
      unlinked: 0,
      unpaired: [],
    });
    expect(await accountOf(accountId)).toMatchObject({
      historySource: "simplefin",
      links: 1,
    });
    expect(await rowsOf(owner, accountId)).toEqual([
      { description: "AMAZON MKTPL", externalSource: "api:simplefin", notes: "gift" },
    ]);
  });
});
