import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditEvents,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "@/lib/finances/import";
import { reclassifyTransactions } from "@/lib/finances/mutations";
import { dispatchAgentTool } from "./tools";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("ledger agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `ledger-agent-${crypto.randomUUID()}@localhost`,
      name: "Ledger Agent Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

async function makeAccount(userId: string, name = "Card"): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name,
      kind: "credit_card",
      institution: "Capital One",
      externalSource: "csv:capitalone-card",
      externalKey: "3448",
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

async function makeEnvelope(userId: string, name: string): Promise<string> {
  const [row] = await db
    .insert(financeBudgetCategories)
    .values({ userId, name, sortKey: `a${crypto.randomUUID().slice(0, 4)}` })
    .returning({ id: financeBudgetCategories.id });
  return row.id;
}

type RowInput = {
  accountId: string;
  description: string;
  amount: string;
  transactionDate?: string;
  externalSource?: string | null;
  budgetCategoryId?: string | null;
  isParent?: boolean;
  parentId?: string | null;
  pending?: boolean;
};

async function insertRow(userId: string, input: RowInput): Promise<string> {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId: input.accountId,
      transactionDate: input.transactionDate ?? "2026-09-10",
      description: input.description,
      amount: input.amount,
      pending: input.pending ?? false,
      externalSource:
        input.externalSource === undefined
          ? "csv:capitalone-card"
          : input.externalSource,
      externalId: crypto.randomUUID(),
      budgetCategoryId: input.budgetCategoryId ?? null,
      isParent: input.isParent ?? false,
      parentId: input.parentId ?? null,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

async function existing(ids: string[]): Promise<string[]> {
  const rows = await db
    .select({ id: financeTransactions.id })
    .from(financeTransactions)
    .where(inArray(financeTransactions.id, ids));
  return rows.map((row) => row.id);
}

async function auditCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: financeAuditEvents.id })
    .from(financeAuditEvents)
    .where(eq(financeAuditEvents.userId, userId));
  return rows.length;
}

type DeleteReceipt = {
  deleted: boolean;
  transactions: {
    id: string;
    accountName: string;
    amountCents: number;
    sourceLabel: string;
    category: string | null;
    splitChildren: number;
  }[];
  readyToAssignDeltaCents: number | null;
  auditEventId: string | null;
  warnings: string[];
};

describeDb("delete_transaction", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await makeAccount(userId);
  });

  it("deletes a split parent with its children and audits it as the agent", async () => {
    const pets = await makeEnvelope(userId, "Pets");
    const parent = await insertRow(userId, {
      accountId,
      description: "TARGET 00012345",
      amount: "-100.00",
      isParent: true,
    });
    const childA = await insertRow(userId, {
      accountId,
      description: "TARGET 00012345",
      amount: "-60.00",
      parentId: parent,
      budgetCategoryId: pets,
    });
    const childB = await insertRow(userId, {
      accountId,
      description: "TARGET 00012345",
      amount: "-40.00",
      parentId: parent,
    });
    const keep = await insertRow(userId, {
      accountId,
      description: "CHEWY.COM",
      amount: "-51.29",
    });

    const receipt = (await dispatchAgentTool(
      "delete_transaction",
      { ids: [parent], reason: "duplicate of the posted row" },
      userId,
    )) as DeleteReceipt;

    expect(receipt.deleted).toBe(true);
    expect(receipt.transactions).toEqual([
      expect.objectContaining({
        id: parent,
        accountName: "Card",
        amountCents: -10000,
        sourceLabel: "Capital One card",
        splitChildren: 2,
      }),
    ]);
    expect(await existing([parent, childA, childB, keep])).toEqual([keep]);
    const [event] = await db
      .select()
      .from(financeAuditEvents)
      .where(eq(financeAuditEvents.id, receipt.auditEventId ?? ""));
    expect(event).toMatchObject({
      userId,
      kind: "transaction_delete",
      origin: "Agent",
    });
    expect(event.summary).toContain("duplicate of the posted row");
  });

  it("warns that a feed still writing the account can bring the row back", async () => {
    const fromFile = await insertRow(userId, {
      accountId,
      description: "CHEWY.COM",
      amount: "-51.29",
    });
    const manual = await insertRow(userId, {
      accountId,
      description: "CASH",
      amount: "-5.00",
      externalSource: null,
    });
    const receipt = (await dispatchAgentTool(
      "delete_transaction",
      { ids: [fromFile, manual] },
      userId,
    )) as DeleteReceipt;
    expect(receipt.warnings).toHaveLength(1);
    expect(receipt.warnings[0]).toMatch(
      /CHEWY\.COM.*Capital One card still writes Card/,
    );
  });

  it("writes nothing on a dry run", async () => {
    const row = await insertRow(userId, {
      accountId,
      description: "X",
      amount: "-1.00",
    });
    const audits = await auditCount(userId);
    const receipt = (await dispatchAgentTool(
      "delete_transaction",
      { ids: [row], dryRun: true },
      userId,
    )) as DeleteReceipt;
    expect(receipt).toMatchObject({ deleted: false, auditEventId: null });
    expect(receipt.transactions.map((entry) => entry.id)).toEqual([row]);
    expect(await existing([row])).toEqual([row]);
    expect(await auditCount(userId)).toBe(audits);
  });

  it("refuses a split child", async () => {
    const parent = await insertRow(userId, {
      accountId,
      description: "TARGET",
      amount: "-10.00",
      isParent: true,
    });
    const child = await insertRow(userId, {
      accountId,
      description: "TARGET",
      amount: "-10.00",
      parentId: parent,
    });
    await expect(
      dispatchAgentTool("delete_transaction", { ids: [child] }, userId),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await existing([parent, child])).toHaveLength(2);
  });

  it("releases the surviving leg of a transfer", async () => {
    const bankFile: ImportFile = {
      name: "2026-08-12_360Checking...2322.csv",
      text: [
        "Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance",
        "2322,Withdrawal from CHASE CREDIT CRD EPAY,05/20/26,Debit,481.2,471.45",
        "",
      ].join("\n"),
    };
    const cardFile: ImportFile = {
      name: "Chase9910_Activity_20260812.csv",
      text: [
        "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
        "05/22/2026,05/22/2026,Payment Thank You-Mobile,,Payment,481.20,",
        "",
      ].join("\n"),
    };
    const transferUser = await makeUser();
    await importFinanceCsvFiles({ userId: transferUser, files: [bankFile, cardFile] });
    await reclassifyTransactions(transferUser);
    const rows = await db
      .select({
        id: financeTransactions.id,
        description: financeTransactions.description,
        transferGroupId: financeTransactions.transferGroupId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, transferUser));
    const epay = rows.find((row) => row.description.includes("EPAY"));
    const thanks = rows.find((row) => row.description.includes("Thank You"));
    expect(epay?.transferGroupId).not.toBeNull();
    expect(thanks?.transferGroupId).toBe(epay?.transferGroupId);

    await dispatchAgentTool("delete_transaction", { ids: [epay?.id] }, transferUser);

    const [survivor] = await db
      .select({ transferGroupId: financeTransactions.transferGroupId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, thanks?.id ?? ""));
    expect(survivor.transferGroupId).toBeNull();
  });

  it("deletes nothing when any id is another user's", async () => {
    const mine = await insertRow(userId, {
      accountId,
      description: "A",
      amount: "-1.00",
    });
    const intruder = await makeUser();
    const theirAccount = await makeAccount(intruder, "Theirs");
    const theirs = await insertRow(intruder, {
      accountId: theirAccount,
      description: "B",
      amount: "-2.00",
    });

    await expect(
      dispatchAgentTool("delete_transaction", { ids: [mine, theirs] }, userId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      dispatchAgentTool("delete_transaction", { ids: [mine] }, intruder),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await existing([mine, theirs])).toHaveLength(2);
  });
});
