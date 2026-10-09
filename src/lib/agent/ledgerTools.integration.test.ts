import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditEvents,
  financeBudgetCategories,
  financePayeeAliases,
  financePayees,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { normalizeMerchant } from "@/lib/finances/classify/merchant";
import { importFinanceCsvFiles, type ImportFile } from "@/lib/finances/import";
import { reclassifyTransactions } from "@/lib/finances/mutations";
import { removePayeeAlias } from "@/lib/finances/payees/aliases";
import { createPayee } from "@/lib/finances/payees/mutations";
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

type AliasReceipt = {
  payee: { id: string; name: string; aliases: string[] };
  added: { input: string; alias: string; movedFrom: { payeeId: string } | null }[];
  removed: { alias: string; reassignedTo: { payeeId: string; name: string } | null }[];
  unchanged: { alias: string; reason: string }[];
  relinkedTransactions: number;
  categorizedTransactions: number;
  sample: { id: string; description: string }[];
  dryRun: boolean;
};

async function payeeOf(rowId: string): Promise<string | null> {
  const [row] = await db
    .select({ payeeId: financeTransactions.payeeId })
    .from(financeTransactions)
    .where(eq(financeTransactions.id, rowId));
  return row.payeeId;
}

async function categoryOf(rowId: string): Promise<string | null> {
  const [row] = await db
    .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
    .from(financeTransactions)
    .where(eq(financeTransactions.id, rowId));
  return row.budgetCategoryId;
}

async function aliasesOf(payeeId: string): Promise<string[]> {
  const rows = await db
    .select({ alias: financePayeeAliases.alias })
    .from(financePayeeAliases)
    .where(eq(financePayeeAliases.payeeId, payeeId));
  return rows.map((row) => row.alias).sort();
}

describeDb("update_payee_aliases", () => {
  const youtube = normalizeMerchant("YouTube");
  let userId: string;
  let accountId: string;
  let streaming: string;
  let target: string;
  let alertRow: string;
  let filedRow: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await makeAccount(userId);
    streaming = await makeEnvelope(userId, "Streaming");
    const other = await makeEnvelope(userId, "Gifts");
    target = await createPayee(userId, {
      name: "Google Youtube Subscri",
      aliases: ["PP*GOOGLE YOUTUBE SUBSCRI"],
    });
    await db
      .update(financePayees)
      .set({ claimedBudgetCategoryId: streaming })
      .where(eq(financePayees.id, target));
    alertRow = await insertRow(userId, {
      accountId,
      description: "YouTube",
      amount: "-13.99",
      pending: true,
    });
    filedRow = await insertRow(userId, {
      accountId,
      description: "YOUTUBE",
      amount: "-13.99",
      transactionDate: "2026-08-10",
      budgetCategoryId: other,
    });
    // Mints the unclaimed YOUTUBE payee these rows resolve to before any alias edit.
    await reclassifyTransactions(userId);
  });

  it("refuses an alias another payee holds unless asked to move it", async () => {
    const minted = await payeeOf(alertRow);
    expect(minted).not.toBe(target);
    await expect(
      dispatchAgentTool(
        "update_payee_aliases",
        { payeeId: target, add: ["YouTube"] },
        userId,
      ),
    ).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("move"),
    });
    expect(await payeeOf(alertRow)).toBe(minted);
  });

  it("moves the alias, re-links its rows, and files only the uncategorized one", async () => {
    const minted = await payeeOf(alertRow);
    const receipt = (await dispatchAgentTool(
      "update_payee_aliases",
      { payeeId: target, add: ["YouTube"], onConflict: "move" },
      userId,
    )) as AliasReceipt;

    expect(receipt.added).toEqual([
      {
        input: "YouTube",
        alias: youtube,
        movedFrom: expect.objectContaining({ payeeId: minted }),
      },
    ]);
    expect(receipt.payee.aliases).toContain(youtube);
    expect(receipt.relinkedTransactions).toBe(2);
    expect(receipt.categorizedTransactions).toBe(1);
    expect(receipt.sample.map((row) => row.id).sort()).toEqual(
      [alertRow, filedRow].sort(),
    );
    expect(await payeeOf(alertRow)).toBe(target);
    expect(await payeeOf(filedRow)).toBe(target);
    expect(await categoryOf(alertRow)).toBe(streaming);
    // A category someone chose always wins over the claim.
    expect(await categoryOf(filedRow)).not.toBe(streaming);
    const listed = (await dispatchAgentTool(
      "list_payees",
      { query: "Google Youtube" },
      userId,
    )) as { payees: { id: string; transactionCount: number }[] };
    expect(listed.payees).toEqual([
      expect.objectContaining({ id: target, transactionCount: 2 }),
    ]);

    const again = (await dispatchAgentTool(
      "update_payee_aliases",
      { payeeId: target, add: ["youtube"] },
      userId,
    )) as AliasReceipt;
    expect(again.added).toEqual([]);
    expect(again.unchanged).toEqual([
      expect.objectContaining({ alias: youtube, reason: "already_on_payee" }),
    ]);
  });

  it("never moves an alias off a payee an envelope claims", async () => {
    const plain = await createPayee(userId, { name: "Somebody" });
    await expect(
      dispatchAgentTool(
        "update_payee_aliases",
        { payeeId: plain, add: ["PP*GOOGLE YOUTUBE SUBSCRI"], onConflict: "move" },
        userId,
      ),
    ).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("claims"),
    });
    expect(await aliasesOf(plain)).toEqual([]);
  });

  it("adds the spelling a transaction carries", async () => {
    const minted = await payeeOf(alertRow);
    const receipt = (await dispatchAgentTool(
      "update_payee_aliases",
      { payeeId: target, addFromTransactionIds: [alertRow], onConflict: "move" },
      userId,
    )) as AliasReceipt;
    expect(receipt.added).toEqual([
      expect.objectContaining({ input: alertRow, alias: youtube }),
    ]);
    expect(await aliasesOf(minted ?? "")).toEqual([]);
  });

  it("changes nothing on a dry run", async () => {
    const minted = await payeeOf(alertRow);
    const before = await aliasesOf(target);
    const receipt = (await dispatchAgentTool(
      "update_payee_aliases",
      { payeeId: target, add: ["YouTube"], onConflict: "move", dryRun: true },
      userId,
    )) as AliasReceipt;
    expect(receipt).toMatchObject({ dryRun: true, relinkedTransactions: 2 });
    expect(await aliasesOf(target)).toEqual(before);
    expect(await payeeOf(alertRow)).toBe(minted);
    expect(await categoryOf(alertRow)).toBeNull();
  });

  it("moves a removed alias's rows onto a payee of their own", async () => {
    await dispatchAgentTool(
      "update_payee_aliases",
      { payeeId: target, add: ["YouTube"], onConflict: "move" },
      userId,
    );
    const receipt = (await dispatchAgentTool(
      "update_payee_aliases",
      { payeeId: target, remove: ["YouTube"] },
      userId,
    )) as AliasReceipt;
    expect(receipt.removed).toHaveLength(1);
    const next = receipt.removed[0].reassignedTo;
    expect(next).not.toBeNull();
    expect(next?.payeeId).not.toBe(target);
    expect(await payeeOf(alertRow)).toBe(next?.payeeId);
    expect(receipt.payee.aliases).not.toContain(youtube);
  });

  it("names a removal that is not on the payee", async () => {
    await expect(
      dispatchAgentTool(
        "update_payee_aliases",
        { payeeId: target, remove: ["NETFLIX"] },
        userId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses input that holds no merchant name", async () => {
    await expect(
      dispatchAgentTool(
        "update_payee_aliases",
        { payeeId: target, add: ["   "] },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("does not let a second user edit the payee or borrow a transaction's spelling", async () => {
    const intruder = await makeUser();
    const theirs = await createPayee(intruder, { name: "Theirs" });
    await expect(
      dispatchAgentTool(
        "update_payee_aliases",
        { payeeId: target, add: ["X"] },
        intruder,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      dispatchAgentTool(
        "update_payee_aliases",
        { payeeId: theirs, addFromTransactionIds: [alertRow] },
        intruder,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await aliasesOf(theirs)).toEqual([]);
  });
});

describeDb("alias paths that recompute payee_id", () => {
  it("re-points rows when the Payees page removes an alias", async () => {
    const userId = await makeUser();
    const accountId = await makeAccount(userId);
    const payee = await createPayee(userId, {
      name: "Streaming",
      aliases: ["NETFLIX", "HULU"],
    });
    const hulu = await insertRow(userId, {
      accountId,
      description: "HULU",
      amount: "-9.99",
    });
    await reclassifyTransactions(userId);
    expect(await payeeOf(hulu)).toBe(payee);

    await removePayeeAlias(userId, payee, "HULU");

    const now = await payeeOf(hulu);
    expect(now).not.toBeNull();
    expect(now).not.toBe(payee);
  });

  it("files the rows a legacy matcher newly covers", async () => {
    const userId = await makeUser();
    const accountId = await makeAccount(userId);
    const row = await insertRow(userId, {
      accountId,
      description: "SPOTIFY",
      amount: "-11.99",
    });
    await dispatchAgentTool(
      "upsert_subscription",
      { name: "Music", matchers: ["Spotify"], cadenceMonths: 1 },
      userId,
    );
    const [bill] = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          eq(financeBudgetCategories.name, "Music"),
        ),
      );
    expect(await categoryOf(row)).toBe(bill.id);
  });
});
