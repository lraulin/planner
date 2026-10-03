import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditEvents,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { AlertRejected, applyAlertEmail } from "./alertIngestWrite";
import { retireAlertHolds } from "./alertHolds";
import { seedBudget } from "./budget/mutations";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("alert ingest");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `alert-${crypto.randomUUID()}@localhost`, name: "Alert Test" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

async function makeCard(
  userId: string,
  over: { historySource?: string; last4?: string } = {},
): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "VentureOne",
      kind: "credit_card",
      institution: "Capital One",
      externalSource: "csv:capitalone-card",
      externalKey: over.last4 ?? "3448",
      historySource: over.historySource ?? "simplefin",
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

const FROM = "capitalone@notification.capitalone.com";
const SUBJECT = "A new transaction was charged to your account";

function push(messageId: string, merchant: string, amount: string, day = "Oct. 2") {
  return {
    messageId,
    from: FROM,
    subject: SUBJECT,
    receivedAt: new Date("2026-10-02T18:14:45Z"),
    plainText: `About your VentureOne Credit Card ending in 3448\n\nAs requested, we're notifying you that on ${day}, 2026, at ${merchant}, a pending authorization or purchase in the amount of ${amount} was placed or charged on your VentureOne Credit Card.`,
  };
}

async function rowsOf(userId: string) {
  return db
    .select()
    .from(financeTransactions)
    .where(eq(financeTransactions.userId, userId));
}

async function addFeedRow(
  userId: string,
  accountId: string,
  over: {
    externalId: string;
    date: string;
    amount: string;
    description: string;
    pending?: boolean;
    categoryId?: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: over.date,
      postedDate: over.pending ? null : over.date,
      pending: over.pending ?? false,
      description: over.description,
      amount: over.amount,
      sourceCategory: "",
      externalSource: "api:simplefin",
      externalId: over.externalId,
      budgetCategoryId: over.categoryId ?? null,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

describeDb("alert holds", () => {
  it("writes one pending, negative hold and treats a re-push as a no-op", async () => {
    const userId = await makeUser();
    const accountId = await makeCard(userId);

    const first = await applyAlertEmail(userId, push("msg-1", "Pizza Hut", "$12.71"));
    const again = await applyAlertEmail(userId, push("msg-1", "Pizza Hut", "$12.71"));

    expect(first.status).toBe("inserted");
    expect(again.status).toBe("duplicate");
    const rows = await rowsOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountId,
      pending: true,
      amount: "-12.71",
      transactionDate: "2026-10-02",
      externalSource: "alert:capitalone",
      externalId: "msg-1",
      description: "Pizza Hut",
    });
  });

  it("keeps two same-day same-amount charges apart by message id", async () => {
    const userId = await makeUser();
    await makeCard(userId);
    await applyAlertEmail(userId, push("msg-a", "Pizza Hut", "$12.71"));
    await applyAlertEmail(userId, push("msg-b", "Pizza Hut", "$12.71"));
    expect(await rowsOf(userId)).toHaveLength(2);
  });

  it("rejects an unknown last four, with the raw text kept as evidence", async () => {
    const userId = await makeUser();
    await makeCard(userId, { last4: "1111" });
    await expect(
      applyAlertEmail(userId, push("msg-x", "Pizza Hut", "$12.71")),
    ).rejects.toBeInstanceOf(AlertRejected);
    expect(await rowsOf(userId)).toHaveLength(0);
    const events = await db
      .select()
      .from(financeAuditEvents)
      .where(
        and(
          eq(financeAuditEvents.userId, userId),
          eq(financeAuditEvents.kind, "alert_email"),
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0].warnings[0]).toMatch(/3448/);
    expect(events[0].sourceEvidence.rawText).toContain("Pizza Hut");
  });

  it("rejects an unparseable body and a card that is not SimpleFIN-sourced", async () => {
    const userId = await makeUser();
    await makeCard(userId, { historySource: "bank_page" });
    await expect(
      applyAlertEmail(userId, push("msg-y", "Pizza Hut", "$12.71")),
    ).rejects.toBeInstanceOf(AlertRejected);
    await expect(
      applyAlertEmail(userId, {
        ...push("msg-z", "x", "$1.00"),
        plainText: "new wording",
      }),
    ).rejects.toBeInstanceOf(AlertRejected);
    expect(await rowsOf(userId)).toHaveLength(0);
  });

  it("never lets a second user read, change or delete the first user's alert hold", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const ownerCard = await makeCard(owner);
    const intruderCard = await makeCard(intruder);
    await applyAlertEmail(owner, push("shared-id", "Pizza Hut", "$12.71"));

    // Same message id for another user is that user's own row, not a collision.
    const theirs = await applyAlertEmail(
      intruder,
      push("shared-id", "Pizza Hut", "$12.71"),
    );
    expect(theirs.status).toBe("inserted");
    expect(await rowsOf(owner)).toHaveLength(1);
    expect(await rowsOf(intruder)).toHaveLength(1);

    // A SimpleFIN twin and a retirement pass under the intruder's id on the owner's account
    // finds nothing to read, retire or flag.
    await addFeedRow(owner, ownerCard, {
      externalId: "sf-1",
      date: "2026-10-03",
      amount: "-12.71",
      description: "PIZZA HUT 0123",
    });
    const trespass = await retireAlertHolds(db, intruder, ownerCard, "2026-12-01");
    expect(trespass).toMatchObject({ retired: 0, carried: 0, flagged: 0 });
    const ownerHold = (await rowsOf(owner)).find(
      (r) => r.externalSource === "alert:capitalone",
    );
    expect(ownerHold).toBeDefined();
    expect(ownerHold?.unlistedAt).toBeNull();
    void intruderCard;
  });

  async function envelopeFor(userId: string): Promise<string> {
    await seedBudget(userId, {
      preset: "minimal",
      startMonth: "2026-09-01",
      todayKey: "2026-10-03",
    });
    const categories = await db
      .select({ id: financeBudgetCategories.id, kind: financeBudgetCategories.kind })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId));
    return categories.find((c) => c.kind !== "income")!.id;
  }

  it("retires a hold onto its exact SimpleFIN twin, carrying envelope and notes", async () => {
    const userId = await makeUser();
    const accountId = await makeCard(userId);
    const categoryId = await envelopeFor(userId);
    await applyAlertEmail(userId, push("msg-1", "Pizza Hut", "$12.71"));
    await db
      .update(financeTransactions)
      .set({ budgetCategoryId: categoryId, notes: "team lunch" })
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.externalId, "msg-1"),
        ),
      );
    const twin = await addFeedRow(userId, accountId, {
      externalId: "sf-1",
      date: "2026-10-02",
      amount: "-12.71",
      description: "PIZZA HUT 00123",
    });

    const result = await retireAlertHolds(db, userId, accountId, "2026-10-03");

    expect(result.retired).toBe(1);
    const rows = await rowsOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: twin,
      budgetCategoryId: categoryId,
      notes: "team lunch",
    });
  });

  it("retires a hold onto a tipped posting and keeps an ambiguous one, flagged after a week", async () => {
    const userId = await makeUser();
    const accountId = await makeCard(userId);
    await applyAlertEmail(userId, push("tip", "Kims Nails", "$50.00", "Sep. 19"));
    await addFeedRow(userId, accountId, {
      externalId: "sf-tip",
      date: "2026-09-21",
      amount: "-60.00",
      description: "KIMS NAILS III",
    });
    await applyAlertEmail(userId, push("amb", "Shell", "$40.00", "Sep. 20"));
    await addFeedRow(userId, accountId, {
      externalId: "sf-amb-1",
      date: "2026-09-22",
      amount: "-40.00",
      description: "CHEVRON 1",
    });
    await addFeedRow(userId, accountId, {
      externalId: "sf-amb-2",
      date: "2026-09-22",
      amount: "-41.00",
      description: "EXXON 2",
    });

    // The ingest itself already ran the retirement pass as each alert landed.
    await retireAlertHolds(db, userId, accountId, "2026-10-03");

    const rows = await rowsOf(userId);
    expect(rows.find((r) => r.externalId === "tip")).toBeUndefined();
    const ambiguous = rows.find((r) => r.externalId === "amb");
    expect(ambiguous).toBeDefined();
    expect(ambiguous?.unlistedAt).not.toBeNull();
    expect(rows.filter((r) => r.externalSource === "api:simplefin")).toHaveLength(3);
  });

  it("does not flag a young unmatched hold, and never deletes it", async () => {
    const userId = await makeUser();
    const accountId = await makeCard(userId);
    await applyAlertEmail(userId, push("young", "Pizza Hut", "$12.71", "Oct. 2"));
    const result = await retireAlertHolds(db, userId, accountId, "2026-10-04");
    expect(result).toMatchObject({ retired: 0, flagged: 0 });
    const [hold] = await rowsOf(userId);
    expect(hold.unlistedAt).toBeNull();

    await retireAlertHolds(db, userId, accountId, "2026-11-01");
    const [stale] = await rowsOf(userId);
    expect(stale.unlistedAt).not.toBeNull();
  });
});
