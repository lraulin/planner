import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { seedBudget } from "./mutations";
import { loadBudget, openingPositionFor } from "./queries";
import { findMonth } from "./envelope";
import {
  applySinglePoolCutover,
  includeNewOnBudgetAccount,
  rebaseAccountMembership,
} from "./membership";
import { updateAccount } from "../mutations";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("budget membership");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `pool-${crypto.randomUUID()}@localhost`,
      name: "Pool Test",
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

const TODAY = "2026-08-22";
const MONTH = "2026-08-01";

async function addAccount(
  userId: string,
  values: {
    name: string;
    kind: "checking" | "savings" | "credit_card" | "investment" | "cash";
    offBudget?: boolean;
    key?: string;
  },
) {
  const [row] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: values.name,
      kind: values.kind,
      offBudget: values.offBudget ?? false,
      externalSource: "test",
      externalKey: values.key ?? `${values.kind}-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  return row.id;
}

async function addTx(
  userId: string,
  accountId: string,
  date: string,
  amount: string,
  description = "ROW",
) {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: date,
      description,
      amount,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

function identityHolds(data: Awaited<ReturnType<typeof loadBudget>>) {
  const current = findMonth(data.months, data.month);
  if (!current) return;
  expect(
    current.readyToAssignCents + current.totalBalanceCents + current.bufferedCents,
  ).toBe(data.accountPoolCents);
}

describeDb("account membership rebase", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("adds a flexible account's pre-start position to opening when it enters the pool", async () => {
    const checkingId = await addAccount(userId, { name: "Checking", kind: "checking" });
    const investId = await addAccount(userId, {
      name: "Brokerage",
      kind: "investment",
      offBudget: true,
    });
    await addTx(userId, checkingId, "2026-07-15", "400.00");
    await addTx(userId, investId, "2026-07-15", "250.00");
    await addTx(userId, investId, "2026-08-05", "10.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    const before = await loadBudget(userId, MONTH);
    const position = await openingPositionFor(userId, MONTH, [investId]);
    expect(position).toBe(25_000);

    const receipt = await rebaseAccountMembership(userId, investId, false);
    expect(receipt.transitions).toHaveLength(1);
    expect(receipt.transitions[0]?.positionCents).toBe(25_000);
    expect(receipt.after.openingCents).toBe(before.settings.openingCents + 25_000);

    const after = await loadBudget(userId, MONTH);
    identityHolds(after);
    expect(after.settings.openingCents).toBe(before.settings.openingCents + 25_000);
  });

  it("subtracts that position when a flexible account leaves, and is idempotent", async () => {
    const investId = await addAccount(userId, {
      name: "Brokerage",
      kind: "investment",
      offBudget: true,
    });
    await addTx(userId, investId, "2026-07-01", "100.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    await rebaseAccountMembership(userId, investId, false);
    const included = await loadBudget(userId, MONTH);
    const receipt = await rebaseAccountMembership(userId, investId, true);
    expect(receipt.transitions).toHaveLength(1);
    expect(receipt.after.openingCents).toBe(included.settings.openingCents - 10_000);

    const again = await rebaseAccountMembership(userId, investId, true);
    expect(again.transitions).toHaveLength(0);
    expect(again.after.openingCents).toBe(receipt.after.openingCents);
  });

  it("refuses to take a core account off budget", async () => {
    const savingsId = await addAccount(userId, { name: "Savings", kind: "savings" });
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await expect(updateAccount(userId, savingsId, { offBudget: true })).rejects.toThrow(
      /always on budget/,
    );
    const [row] = await db
      .select({ offBudget: financeAccounts.offBudget })
      .from(financeAccounts)
      .where(eq(financeAccounts.id, savingsId));
    expect(row?.offBudget).toBe(false);
  });

  it("forces a flexible account on-budget when its kind becomes core", async () => {
    const investId = await addAccount(userId, {
      name: "Was investment",
      kind: "investment",
      offBudget: true,
    });
    await addTx(userId, investId, "2026-07-01", "80.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const before = (await loadBudget(userId, MONTH)).settings.openingCents;

    await updateAccount(userId, investId, { kind: "savings" });
    const [row] = await db
      .select({ kind: financeAccounts.kind, offBudget: financeAccounts.offBudget })
      .from(financeAccounts)
      .where(eq(financeAccounts.id, investId));
    expect(row).toMatchObject({ kind: "savings", offBudget: false });
    expect((await loadBudget(userId, MONTH)).settings.openingCents).toBe(
      before + 8_000,
    );
  });

  it("does not rebase when a core account is closed", async () => {
    const checkingId = await addAccount(userId, { name: "Checking", kind: "checking" });
    await addTx(userId, checkingId, "2026-07-01", "50.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const opening = (await loadBudget(userId, MONTH)).settings.openingCents;
    await updateAccount(userId, checkingId, { closedOn: "2026-08-20" });
    expect((await loadBudget(userId, MONTH)).settings.openingCents).toBe(opening);
    identityHolds(await loadBudget(userId, MONTH));
  });

  it("includes a new on-budget account created after setup, once", async () => {
    const checkingId = await addAccount(userId, { name: "Checking", kind: "checking" });
    await addTx(userId, checkingId, "2026-07-01", "20.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const opening = (await loadBudget(userId, MONTH)).settings.openingCents;

    const savingsId = await addAccount(userId, {
      name: "New savings",
      kind: "savings",
    });
    await addTx(userId, savingsId, "2026-06-01", "300.00");
    const first = await includeNewOnBudgetAccount(userId, savingsId);
    expect(first.transitions).toHaveLength(1);
    expect((await loadBudget(userId, MONTH)).settings.openingCents).toBe(
      opening + 30_000,
    );
    identityHolds(await loadBudget(userId, MONTH));
  });
});

const CORE_ON_BUDGET_CHECK = sql`
  ALTER TABLE finance_accounts
    ADD CONSTRAINT finance_accounts_core_on_budget
    CHECK (
      kind::text not in ('checking', 'savings', 'cash', 'credit_card')
      or off_budget = false
    )
`;

describeDb("single-pool cutover", () => {
  let ownerId: string;
  let intruderId: string;

  beforeEach(async () => {
    // The generated CHECK refuses the historical off-budget savings row this suite
    // exists to migrate. Drop it for the fixture, restore after.
    await db.execute(
      sql`ALTER TABLE finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_core_on_budget`,
    );
    ownerId = await makeUser();
    intruderId = await makeUser();
  });

  afterEach(async () => {
    await db.execute(sql`
      UPDATE finance_accounts
         SET off_budget = false
       WHERE kind::text in ('checking', 'savings', 'cash', 'credit_card')
         AND off_budget = true
    `);
    await db.execute(
      sql`ALTER TABLE finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_core_on_budget`,
    );
    await db.execute(CORE_ON_BUDGET_CHECK);
  });

  it("rebases off-budget savings, preserves allocations, and is a no-op on retry", async () => {
    const checkingId = await addAccount(ownerId, {
      name: "Checking",
      kind: "checking",
    });
    const savingsId = await addAccount(ownerId, {
      name: "360 Savings",
      kind: "savings",
      offBudget: true,
    });
    await addTx(ownerId, checkingId, "2026-07-01", "500.00");
    await addTx(ownerId, savingsId, "2026-07-01", "200.00");
    await addTx(ownerId, checkingId, "2026-08-05", "100.00");
    await seedBudget(ownerId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });

    const dry = await applySinglePoolCutover(ownerId, { dryRun: true });
    expect(dry.transitions).toHaveLength(1);
    const stillOff = await db
      .select({ offBudget: financeAccounts.offBudget })
      .from(financeAccounts)
      .where(eq(financeAccounts.id, savingsId));
    expect(stillOff[0]?.offBudget).toBe(true);
    expect((await loadBudget(ownerId, MONTH)).settings.openingCents).toBe(
      dry.before.openingCents,
    );

    const applied = await applySinglePoolCutover(ownerId);
    expect(applied.transitions).toHaveLength(1);
    expect(applied.after.openingCents).toBe(applied.before.openingCents + 20_000);
    identityHolds(await loadBudget(ownerId, MONTH));

    const [row] = await db
      .select({ offBudget: financeAccounts.offBudget })
      .from(financeAccounts)
      .where(eq(financeAccounts.id, savingsId));
    expect(row?.offBudget).toBe(false);

    const retry = await applySinglePoolCutover(ownerId);
    expect(retry.transitions).toHaveLength(0);
    expect(retry.after.openingCents).toBe(applied.after.openingCents);
  });

  it("does not let a second user inspect or apply the owner's cutover", async () => {
    await addAccount(ownerId, {
      name: "360 Savings",
      kind: "savings",
      offBudget: true,
    });
    await seedBudget(ownerId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });

    const peek = await applySinglePoolCutover(intruderId, { dryRun: true });
    expect(peek.transitions).toHaveLength(0);

    await applySinglePoolCutover(intruderId);
    const [row] = await db
      .select({
        id: financeAccounts.id,
        offBudget: financeAccounts.offBudget,
      })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, ownerId));
    expect(row?.offBudget).toBe(true);
    if (!row) throw new Error("expected the owner's savings account");

    await expect(rebaseAccountMembership(intruderId, row.id, false)).rejects.toThrow(
      /Account not found/,
    );
  });
});
