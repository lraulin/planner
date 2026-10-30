import { afterAll, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditEvents,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { localDateKey } from "@/lib/schedule/geometry";
import { monthKeyOf } from "@/lib/finances/budget/envelope";
import { seedBudget } from "@/lib/finances/budget/mutations";
import type { z } from "zod";
import type { outputSchemas } from "./contracts";
import { dispatchAgentTool } from "./tools";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("budget agent tools");

// The tools read the server's today, so the fixture budget starts in the current month.
const TODAY = localDateKey(new Date());
const MONTH = monthKeyOf(TODAY).slice(0, 7);

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `budget-agent-${crypto.randomUUID()}@localhost`,
      name: "Budget Agent Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

async function call<Name extends Parameters<typeof dispatchAgentTool>[0]>(
  name: Name,
  body: Record<string, unknown>,
  userId: string,
) {
  return (await dispatchAgentTool(name, body, userId)) as Name extends keyof Outputs
    ? Outputs[Name]
    : unknown;
}

type Output<K extends keyof typeof outputSchemas> = z.output<(typeof outputSchemas)[K]>;

type Outputs = {
  get_budget_month: Output<"get_budget_month">;
  create_budget_group: Output<"create_budget_group">;
  update_budget_group: Output<"update_budget_group">;
  create_budget_envelope: Output<"create_budget_envelope">;
  update_budget_envelope: Output<"update_budget_envelope">;
  set_budget_assignment: Output<"set_budget_assignment">;
  move_budget_money: Output<"move_budget_money">;
  set_transaction_category: Output<"set_transaction_category">;
  split_transaction: Output<"split_transaction">;
};

/** A user with the minimal preset, a checking account and House / Vet envelopes. */
async function setUp() {
  const userId = await makeUser();
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: `chk-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  await seedBudget(userId, { preset: "minimal", todayKey: TODAY });

  const funds = await call(
    "create_budget_group",
    { name: "Funds", kind: "savings" },
    userId,
  );
  const house = await call(
    "create_budget_envelope",
    { name: "House", kind: "savings", groupId: funds.group.id },
    userId,
  );
  const vet = await call(
    "create_budget_envelope",
    { name: "Vet", kind: "savings", groupId: funds.group.id, notes: "Dog and cat" },
    userId,
  );
  return {
    userId,
    accountId: account.id,
    groupId: funds.group.id,
    houseId: house.envelope.id,
    vetId: vet.envelope.id,
  };
}

async function insertRow(userId: string, accountId: string, amount: string) {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: TODAY,
      description: "PETSMART #123",
      amount,
      pending: false,
      externalSource: "test",
      externalId: crypto.randomUUID(),
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

async function latestAudit(userId: string) {
  const [row] = await db
    .select({ kind: financeAuditEvents.kind, origin: financeAuditEvents.origin })
    .from(financeAuditEvents)
    .where(eq(financeAuditEvents.userId, userId))
    .orderBy(desc(financeAuditEvents.occurredAt))
    .limit(1);
  return row;
}

function envelopeIn(month: Output<"get_budget_month">, id: string) {
  return month.envelopes.find((row) => row.id === id);
}

describeDb("budget agent tools", () => {
  it("refuses to read a budget that is not set up", async () => {
    const userId = await makeUser();
    await expect(call("get_budget_month", {}, userId)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("creates, renames and hides groups and envelopes", async () => {
    const { userId, groupId, houseId, vetId } = await setUp();

    const month = await call("get_budget_month", {}, userId);
    expect(month.month).toBe(MONTH);
    expect(month.groups.map((group) => group.name)).toContain("Funds");
    expect(envelopeIn(month, vetId)).toMatchObject({
      name: "Vet",
      kind: "savings",
      groupId,
    });

    // Same name in the same group, any case.
    await expect(
      call(
        "create_budget_envelope",
        { name: "house", kind: "savings", groupId },
        userId,
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      call("create_budget_group", { name: "funds", kind: "savings" }, userId),
    ).rejects.toMatchObject({ code: "conflict" });
    // An envelope's kind must match its group's.
    await expect(
      call(
        "create_budget_envelope",
        { name: "Toys", kind: "spending", groupId },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });

    const renamed = await call(
      "update_budget_envelope",
      { id: vetId, name: "Vet / Pet Medical" },
      userId,
    );
    expect(renamed.envelope).toMatchObject({
      name: "Vet / Pet Medical",
      groupName: "Funds",
      notes: "Dog and cat",
    });
    await expect(
      call("update_budget_envelope", { id: vetId, name: "HOUSE" }, userId),
    ).rejects.toMatchObject({ code: "conflict" });

    const group = await call(
      "update_budget_group",
      { id: groupId, name: "Sinking funds" },
      userId,
    );
    expect(group.group.name).toBe("Sinking funds");

    const hidden = await call(
      "update_budget_envelope",
      { id: houseId, hidden: true },
      userId,
    );
    expect(hidden.envelope.hidden).toBe(true);
    const visible = await call("get_budget_month", {}, userId);
    expect(envelopeIn(visible, houseId)).toBeUndefined();
    expect(visible.hiddenEnvelopeCount).toBe(1);
    const all = await call("get_budget_month", { includeHidden: true }, userId);
    expect(envelopeIn(all, houseId)).toMatchObject({ hidden: true });

    // Structure edits are not money events, so — as on the Budget page — no audit row.
    expect(await latestAudit(userId)).toBeUndefined();
  });

  it("sets and adjusts an envelope's assigned amount, warning when Ready to Assign goes negative", async () => {
    const { userId, houseId } = await setUp();

    const set = await call(
      "set_budget_assignment",
      { month: MONTH, envelopeId: houseId, amountCents: 100_000 },
      userId,
    );
    expect(set).toMatchObject({
      applied: true,
      previousAssignedCents: 0,
      envelope: { assignedCents: 100_000, availableCents: 100_000 },
    });
    // Nothing has come in, so the assignment overcommits the budget.
    expect(set.readyToAssignCents).toBeLessThan(0);
    expect(set.warnings[0]).toMatch(/Ready to Assign is now -\$/);
    expect(await latestAudit(userId)).toMatchObject({ origin: "Agent" });

    const adjusted = await call(
      "set_budget_assignment",
      { month: MONTH, envelopeId: houseId, adjustCents: -25_000 },
      userId,
    );
    expect(adjusted.envelope.assignedCents).toBe(75_000);
    expect(adjusted.previousAssignedCents).toBe(100_000);
    expect(adjusted.readyToAssignCents).toBe(set.readyToAssignCents + 25_000);

    await expect(
      call(
        "set_budget_assignment",
        { month: MONTH, envelopeId: houseId, adjustCents: -80_000 },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      call(
        "set_budget_assignment",
        { month: MONTH, envelopeId: houseId, amountCents: 1, adjustCents: 1 },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      call(
        "set_budget_assignment",
        { month: "1999-01", envelopeId: houseId, amountCents: 1 },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });

    const month = await call("get_budget_month", { month: MONTH }, userId);
    const income = month.income[0];
    await expect(
      call(
        "set_budget_assignment",
        { month: MONTH, envelopeId: income.id, amountCents: 1 },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("moves money between envelopes in one write and refuses to overdraw the source", async () => {
    const { userId, houseId, vetId } = await setUp();
    await call(
      "set_budget_assignment",
      { month: MONTH, envelopeId: houseId, amountCents: 100_000 },
      userId,
    );
    const before = await call("get_budget_month", {}, userId);

    const moved = await call(
      "move_budget_money",
      {
        month: MONTH,
        fromEnvelopeId: houseId,
        toEnvelopeId: vetId,
        amountCents: 62_365,
      },
      userId,
    );
    expect(moved).toMatchObject({
      moved: true,
      amountCents: 62_365,
      from: { id: houseId, assignedCents: 37_635, availableCents: 37_635 },
      to: { id: vetId, assignedCents: 62_365, availableCents: 62_365 },
      readyToAssignCents: before.summary.readyToAssignCents,
    });
    expect(await latestAudit(userId)).toMatchObject({ origin: "Agent" });

    // More than House holds: refused whole, nothing written.
    await expect(
      call(
        "move_budget_money",
        {
          month: MONTH,
          fromEnvelopeId: houseId,
          toEnvelopeId: vetId,
          amountCents: 37_636,
        },
        userId,
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringMatching(/House has \$376\.35 available/),
    });
    const after = await call("get_budget_month", {}, userId);
    expect(envelopeIn(after, houseId)?.assignedCents).toBe(37_635);
    expect(envelopeIn(after, vetId)?.assignedCents).toBe(62_365);

    await expect(
      call(
        "move_budget_money",
        {
          month: MONTH,
          fromEnvelopeId: houseId,
          toEnvelopeId: houseId,
          amountCents: 1,
        },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("recategorizes and splits transactions", async () => {
    const { userId, accountId, houseId, vetId } = await setUp();
    const row = await insertRow(userId, accountId, "-120.00");
    const missing = crypto.randomUUID();

    const filed = await call(
      "set_transaction_category",
      { ids: [row, missing], envelopeId: vetId },
      userId,
    );
    expect(filed.updated).toEqual([row]);
    expect(filed.skipped).toEqual([{ id: missing, reason: "Transaction not found." }]);
    expect(await latestAudit(userId)).toMatchObject({ origin: "Agent" });

    const split = await call(
      "split_transaction",
      {
        id: row,
        splits: [
          { amountCents: -10_000, envelopeId: vetId, notes: "Exam" },
          { amountCents: -2_000, envelopeId: houseId },
        ],
      },
      userId,
    );
    expect(split.split).toBe(true);
    expect(split.amountCents).toBe(-12_000);
    expect(split.lines.map((line) => [line.amountCents, line.envelopeName])).toEqual([
      [-10_000, "Vet"],
      [-2_000, "House"],
    ]);
    expect(await latestAudit(userId)).toMatchObject({
      kind: "transaction_split",
      origin: "Agent",
    });

    // Lines that don't add up to the row are refused.
    await expect(
      call(
        "split_transaction",
        { id: row, splits: [{ amountCents: -1, envelopeId: vetId }] },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });

    // A split parent is filed through its lines.
    const parent = await call(
      "set_transaction_category",
      { ids: [row], envelopeId: houseId },
      userId,
    );
    expect(parent.updated).toEqual([]);
    expect(parent.skipped[0]?.reason).toMatch(/Split parent|split/i);

    const reworked = await call(
      "split_transaction",
      {
        id: row,
        splits: [
          { amountCents: -6_000, envelopeId: vetId },
          { amountCents: -6_000, envelopeId: vetId },
        ],
      },
      userId,
    );
    expect(reworked.lines).toHaveLength(2);

    const unsplit = await call("split_transaction", { id: row, splits: [] }, userId);
    expect(unsplit).toMatchObject({ split: false, lines: [] });

    const cleared = await call(
      "set_transaction_category",
      { ids: [row], envelopeId: null },
      userId,
    );
    expect(cleared.envelope).toBeNull();
    const [stored] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(
        and(eq(financeTransactions.userId, userId), eq(financeTransactions.id, row)),
      );
    expect(stored?.budgetCategoryId).toBeNull();
  });

  it("keeps one user's budget out of another's reach", async () => {
    const owner = await setUp();
    await call(
      "set_budget_assignment",
      { month: MONTH, envelopeId: owner.houseId, amountCents: 50_000 },
      owner.userId,
    );
    const row = await insertRow(owner.userId, owner.accountId, "-30.00");
    const intruder = await setUp();

    const notFound = { code: "not_found" };
    await expect(
      call(
        "update_budget_envelope",
        { id: owner.houseId, name: "Mine" },
        intruder.userId,
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      call("update_budget_group", { id: owner.groupId, name: "Mine" }, intruder.userId),
    ).rejects.toMatchObject(notFound);
    await expect(
      call(
        "create_budget_envelope",
        { name: "Sneaky", kind: "savings", groupId: owner.groupId },
        intruder.userId,
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      call(
        "set_budget_assignment",
        { month: MONTH, envelopeId: owner.houseId, amountCents: 0 },
        intruder.userId,
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      call(
        "move_budget_money",
        {
          month: MONTH,
          fromEnvelopeId: owner.houseId,
          toEnvelopeId: intruder.vetId,
          amountCents: 100,
        },
        intruder.userId,
      ),
    ).rejects.toMatchObject(notFound);
    // Their envelope on my row, my envelope on their row.
    await expect(
      call(
        "set_transaction_category",
        { ids: [row], envelopeId: owner.vetId },
        intruder.userId,
      ),
    ).rejects.toMatchObject(notFound);
    const theirRow = await call(
      "set_transaction_category",
      { ids: [row], envelopeId: intruder.vetId },
      intruder.userId,
    );
    expect(theirRow.updated).toEqual([]);
    expect(theirRow.skipped).toEqual([{ id: row, reason: "Transaction not found." }]);
    await expect(
      call(
        "split_transaction",
        { id: row, splits: [{ amountCents: -3_000, envelopeId: intruder.vetId }] },
        intruder.userId,
      ),
    ).rejects.toMatchObject(notFound);
    const intruderRow = await insertRow(intruder.userId, intruder.accountId, "-30.00");
    await expect(
      call(
        "split_transaction",
        { id: intruderRow, splits: [{ amountCents: -3_000, envelopeId: owner.vetId }] },
        intruder.userId,
      ),
    ).rejects.toMatchObject(notFound);

    const theirs = await call(
      "get_budget_month",
      { includeHidden: true },
      intruder.userId,
    );
    expect(envelopeIn(theirs, owner.houseId)).toBeUndefined();

    const mine = await call("get_budget_month", {}, owner.userId);
    expect(envelopeIn(mine, owner.houseId)).toMatchObject({
      name: "House",
      assignedCents: 50_000,
    });
    const [stored] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, row));
    expect(stored?.budgetCategoryId).toBeNull();
  });
});
