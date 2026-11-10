import { expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditEvents,
  financeBudgetCategories,
  financeTransactions,
} from "@/db/schema";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import {
  AlertRejected,
  applyAlertEmail,
  retryRejectedAlerts,
  type AlertPush,
} from "./alertIngestWrite";
import { retireAlertHolds } from "./alertHolds";
import { seedBudget } from "./budget/mutations";
import { loadAccountsWithPending } from "./workingPendingQuery";

const describeDb = await describeWithDatabase("alert ingest");

const makeUser = testUsers("alert");

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

/**
 * Ingest as of the week the alerts are dated in, not the day the suite runs. Ingest ends
 * with a retirement pass that flags a hold once it is a week old, so against the wall clock
 * every hold here turned "lost" on arrival from 2026-10-10 on and three tests began failing
 * with no change to the code.
 */
const INGEST_DAY = "2026-10-04";

function ingest(userId: string, alert: AlertPush) {
  return applyAlertEmail(userId, alert, INGEST_DAY);
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

describeDb("alert holds", () => {
  it("writes one pending, negative hold and treats a re-push as a no-op", async () => {
    const userId = await makeUser();
    const accountId = await makeCard(userId);

    const first = await ingest(userId, push("msg-1", "Pizza Hut", "$12.71"));
    const again = await ingest(userId, push("msg-1", "Pizza Hut", "$12.71"));

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
    await ingest(userId, push("msg-a", "Pizza Hut", "$12.71"));
    await ingest(userId, push("msg-b", "Pizza Hut", "$12.71"));
    expect(await rowsOf(userId)).toHaveLength(2);
  });

  it("rejects an unknown last four, with the raw text kept as evidence", async () => {
    const userId = await makeUser();
    await makeCard(userId, { last4: "1111" });
    await expect(
      ingest(userId, push("msg-x", "Pizza Hut", "$12.71")),
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
      ingest(userId, push("msg-y", "Pizza Hut", "$12.71")),
    ).rejects.toBeInstanceOf(AlertRejected);
    await expect(
      ingest(userId, {
        ...push("msg-z", "x", "$1.00"),
        plainText: "new wording",
      }),
    ).rejects.toBeInstanceOf(AlertRejected);
    expect(await rowsOf(userId)).toHaveLength(0);
  });

  it("lands a rejected alert on retry once the card is SimpleFIN-sourced, and only once", async () => {
    const userId = await makeUser();
    const otherId = await makeUser();
    const accountId = await makeCard(userId, { historySource: "bank_page" });
    await makeCard(otherId);
    await expect(
      ingest(userId, push("msg-late", "Pizza Hut", "$12.71")),
    ).rejects.toBeInstanceOf(AlertRejected);

    const eventCount = async () =>
      (
        await db
          .select({ id: financeAuditEvents.id })
          .from(financeAuditEvents)
          .where(eq(financeAuditEvents.userId, userId))
      ).length;

    // Still refused: nothing lands and the refusal is not audited a second time.
    expect(await retryRejectedAlerts(userId, INGEST_DAY)).toBe(0);
    expect(await eventCount()).toBe(1);
    // Another user's sync never picks up this user's rejected mail.
    expect(await retryRejectedAlerts(otherId, INGEST_DAY)).toBe(0);
    expect(await rowsOf(otherId)).toHaveLength(0);

    await db
      .update(financeAccounts)
      .set({ historySource: "simplefin" })
      .where(eq(financeAccounts.id, accountId));
    expect(await retryRejectedAlerts(userId, INGEST_DAY)).toBe(1);
    expect(await retryRejectedAlerts(userId, INGEST_DAY)).toBe(0);
    const rows = await rowsOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ externalId: "msg-late", pending: true });

    // Past the week, a rejection is left alone.
    expect(await retryRejectedAlerts(userId, "2026-11-01")).toBe(0);
  });

  it("keeps a new alert hold when the only look-alike posted rows are earlier purchases", async () => {
    // Lee's Capital One •••3448, 2026-10-04: Walmart, Chewy and Pizza Hut alerts each
    // retired onto an older row (Walmart $261.36 on 9/28, Tequila Grill $49.87 on 9/30,
    // Pizza Hut $12.71 on 9/28) and vanished from the register.
    const userId = await makeUser();
    await makeCard(userId);
    const older = [
      ["sf-walmart", "2026-09-28", "-261.36", "WAL-MART #1981"],
      ["sf-tequila", "2026-09-30", "-49.87", "TEQUILA GRILL CANTIN"],
      ["sf-pizza", "2026-09-28", "-12.71", "PIZZA HUT 036874"],
    ] as const;
    const accountId = (
      await db.select().from(financeAccounts).where(eq(financeAccounts.userId, userId))
    )[0].id;
    for (const [externalId, date, amount, description] of older) {
      await addFeedRow(userId, accountId, { externalId, date, amount, description });
    }

    const results = [
      await ingest(userId, push("a-walmart", "Walmart", "$200.84", "Oct. 4")),
      await ingest(userId, push("a-chewy", "Chewy.com", "$51.29", "Oct. 4")),
      await ingest(userId, push("a-pizza", "Pizza Hut", "$12.71", "Oct. 2")),
    ];

    expect(results.map((r) => r.status)).toEqual(["inserted", "inserted", "inserted"]);
    const holds = (await rowsOf(userId)).filter(
      (r) => r.externalSource === "alert:capitalone",
    );
    expect(holds.map((r) => r.description).sort()).toEqual([
      "Chewy.com",
      "Pizza Hut",
      "Walmart",
    ]);
    expect(holds.every((r) => r.pending && r.unlistedAt === null)).toBe(true);
  });

  it("still retires an alert hold onto the feed row that posts for it afterwards", async () => {
    const userId = await makeUser();
    const accountId = await makeCard(userId);
    await ingest(userId, push("a-chewy", "Chewy.com", "$51.29", "Oct. 4"));
    await addFeedRow(userId, accountId, {
      externalId: "sf-chewy",
      date: "2026-10-05",
      amount: "-51.29",
      description: "CHEWY.COM",
    });

    const result = await retireAlertHolds(db, userId, accountId, "2026-10-06");

    expect(result.retired).toBe(1);
    const rows = await rowsOf(userId);
    expect(rows.map((r) => r.externalSource)).toEqual(["api:simplefin"]);
  });

  it("never lets a second user read, change or delete the first user's alert hold", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const ownerCard = await makeCard(owner);
    const intruderCard = await makeCard(intruder);
    await ingest(owner, push("shared-id", "Pizza Hut", "$12.71"));

    // Same message id for another user is that user's own row, not a collision.
    const theirs = await ingest(intruder, push("shared-id", "Pizza Hut", "$12.71"));
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
    await ingest(userId, push("msg-1", "Pizza Hut", "$12.71"));
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
    await ingest(userId, push("tip", "Kims Nails", "$50.00", "Sep. 19"));
    await addFeedRow(userId, accountId, {
      externalId: "sf-tip",
      date: "2026-09-21",
      amount: "-60.00",
      description: "KIMS NAILS III",
    });
    await ingest(userId, push("amb", "Shell", "$40.00", "Sep. 20"));
    await addFeedRow(userId, accountId, {
      externalId: "sf-amb-1",
      date: "2026-09-22",
      amount: "-40.00",
      description: "CHEVRON 1",
    });
    await addFeedRow(userId, accountId, {
      externalId: "sf-amb-2",
      date: "2026-09-22",
      amount: "-40.00",
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

  it("keeps a hold beside an unrelated row at a near amount, however old it gets", async () => {
    // Production, 2026-10-23: a YouTube hold went onto Grok's row two days before its own.
    const userId = await makeUser();
    const accountId = await makeCard(userId);
    await ingest(userId, push("youtube", "YouTube", "$16.95", "Oct. 2"));
    await addFeedRow(userId, accountId, {
      externalId: "sf-grok",
      date: "2026-10-02",
      amount: "-15.90",
      description: "GROK XAI",
    });

    await retireAlertHolds(db, userId, accountId, "2026-10-03");
    await retireAlertHolds(db, userId, accountId, "2026-10-08");
    const rows = await rowsOf(userId);
    expect(rows.find((r) => r.externalId === "youtube")).toBeDefined();
    expect(rows).toHaveLength(2);
  });

  it("waits before retiring a hold onto the same merchant's near-amount row", async () => {
    const userId = await makeUser();
    const accountId = await makeCard(userId);
    await ingest(userId, push("chewy", "Chewy.com", "$53.20", "Oct. 2"));
    await addFeedRow(userId, accountId, {
      externalId: "sf-other-order",
      date: "2026-10-03",
      amount: "-51.29",
      description: "CHEWY.COM",
    });

    const young = await retireAlertHolds(db, userId, accountId, "2026-10-04");
    expect(young.retired).toBe(0);
    expect(await rowsOf(userId)).toHaveLength(2);

    // Its own row never came, so the near one is what it became.
    const aged = await retireAlertHolds(db, userId, accountId, "2026-10-06");
    expect(aged.retired).toBe(1);
    expect((await rowsOf(userId)).map((r) => r.externalId)).toEqual(["sf-other-order"]);
  });

  it("does not flag a young unmatched hold, and never deletes it", async () => {
    const userId = await makeUser();
    const accountId = await makeCard(userId);
    await ingest(userId, push("young", "Pizza Hut", "$12.71", "Oct. 2"));
    const result = await retireAlertHolds(db, userId, accountId, "2026-10-04");
    expect(result).toMatchObject({ retired: 0, flagged: 0 });
    const [hold] = await rowsOf(userId);
    expect(hold.unlistedAt).toBeNull();

    await retireAlertHolds(db, userId, accountId, "2026-11-01");
    const [stale] = await rowsOf(userId);
    expect(stale.unlistedAt).not.toBeNull();

    // The Accounts page counts it for its owner and for nobody else.
    const otherId = await makeUser();
    await makeCard(otherId);
    expect((await loadAccountsWithPending(userId)).pending.unlistedHolds).toEqual([
      { accountId, count: 1 },
    ]);
    expect((await loadAccountsWithPending(otherId)).pending.unlistedHolds).toEqual([]);
  });
});
