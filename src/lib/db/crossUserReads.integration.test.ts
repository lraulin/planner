import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";

import { createNode } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { createNodeItem, saveNodeDetail } from "@/lib/detail/mutations";
import { loadNodeDetail } from "@/lib/detail/queries";
import { loadWishList } from "@/lib/detail/wishQueries";
import { createNote } from "@/lib/notes/mutations";
import { loadDiarySummaries, loadNotes, loadNotesForNode } from "@/lib/notes/queries";
import { createMetric, createMetricEntry } from "@/lib/metrics/mutations";
import {
  getMetricDetail,
  getMetricEntry,
  listMetrics,
  listMetricsForOwner,
} from "@/lib/metrics/queries";
import { createAppointment, createTimeChart } from "@/lib/schedule/mutations";
import {
  getAppointment,
  getTimeChart,
  listAppointmentsInRange,
  listTimeCharts,
  loadSchedule,
} from "@/lib/schedule/queries";
import { weekRange } from "@/lib/schedule/range";
import { createContact, createDiscussionItem } from "@/lib/contacts/mutations";
import {
  getContactDetail,
  loadContactOptions,
  loadContacts,
  loadDiscussionItems,
} from "@/lib/contacts/queries";
import { createResource } from "@/lib/resources/mutations";
import { getResourceDetail, listResources } from "@/lib/resources/queries";
import { importAmazonSlim } from "@/lib/amazon/import";
import { getAmazonItem, listAmazonItems } from "@/lib/amazon/queries";
import { SLIM_SOURCE, SLIM_VERSION } from "@/lib/amazon/types";
import { importFinanceCsvFiles } from "@/lib/finances/import";
import {
  loadCarryingCost,
  loadInsightsRows,
  loadRecurringBills,
  unclassifiedCount,
} from "@/lib/finances/dashboardQueries";
import { upsertRecurringBill } from "@/lib/finances/mutations";
import {
  getPaymentResolution,
  getTransaction,
  listAccounts,
  listPaymentResolutions,
  listStatements,
  listTransactions,
  transactionTotalCents,
} from "@/lib/finances/queries";
import { ensureWeeklyPlan, upsertPlanEntry } from "@/lib/planning/mutations";
import {
  getWeeklyPlan,
  getWeeklyPlanById,
  listPlanEntries,
  listWeeklyPlans,
} from "@/lib/planning/queries";
import { createExercise, createSession } from "@/lib/fitness/mutations";
import {
  getExercise,
  getSessionDetail,
  listExercises,
  listSessions,
  loadExerciseHistory,
} from "@/lib/fitness/queries";
import { createDailyItem, saveJournal } from "@/lib/day/mutations";
import {
  loadDay,
  loadJournal,
  loadWeek,
  plannedDayForNode,
  plannedNodeIds,
} from "@/lib/day/queries";
import { writeUserSetting } from "@/lib/settings/mutations";
import { loadUserSettings } from "@/lib/settings/queries";

/**
 * One invariant, every read path: **no query hands a user another user's rows.**
 *
 * The mutation files each carry their own cross-user block, because a dropped `userId` in a
 * `where` is invisible while you only ever test with one account. The queries had no such
 * file — every one of them is exercised somewhere, but only ever as the user who wrote the
 * row, which is exactly the shape of test that cannot catch this.
 *
 * Cross-cutting rather than one file per module on purpose. Twelve near-identical files
 * would each re-seed a user and re-import a harness to assert one sentence; the sentence is
 * the same sentence, and it is easier to see a domain missing from one list than from twelve
 * directories.
 *
 * The failure this guards is not subtle once it happens and completely silent until it does:
 * drop `eq(x.userId, userId)` from a `where` and every test that only ever had one user in
 * the database keeps passing.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("cross-user reads");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

/** Everything user A owns, so the assertions can name the ids B must not see. */
type Owned = {
  userId: string;
  goalId: string;
  taskId: string;
  wishId: string;
  noteId: string;
  metricId: string;
  metricEntryId: string;
  appointmentId: string;
  timeChartId: string;
  contactId: string;
  resourceId: string;
  financeAccountId: string;
  financeTransactionId: string;
  financeStatementId: string;
  paymentResolutionId: string;
  amazonItemId: string;
  planId: string;
  exerciseId: string;
  sessionId: string;
  dayItemId: string;
  day: string;
  weekStart: Date;
};

const DAY = "2026-03-11";
const WEEK_START = new Date(2026, 2, 8);
const RANGE_FROM = new Date(2026, 2, 1);
const RANGE_TO = new Date(2026, 2, 31);

async function seedOwner(): Promise<Owned> {
  const userId = await makeUser();

  const areaId = await createNode({ userId, parentId: null, type: "result_area" });
  const goalId = await createNode({ userId, parentId: areaId, type: "goal" });
  const projectId = await createNode({ userId, parentId: goalId, type: "project" });
  const taskId = await createNode({ userId, parentId: projectId, type: "task" });
  await saveNodeDetail(userId, taskId, { notes: "owner-only body" });
  const wishId = await createNodeItem({
    userId,
    nodeId: goalId,
    kind: "wish_want_dont_have",
  });

  const noteId = await createNote({ userId, values: { title: "Owner note" } });
  await saveNodeDetail(userId, taskId, {});

  const metricId = await createMetric(userId, {
    title: "Owner metric",
    ownerNodeId: goalId,
  });
  const metricEntryId = await createMetricEntry(userId, metricId, {
    entryDate: DAY,
    value: 42,
  });

  const appointment = await createAppointment(userId, {
    subject: "Owner appointment",
    startAt: new Date(2026, 2, 11, 9, 0),
    endAt: new Date(2026, 2, 11, 10, 0),
  });
  if (!appointment) throw new Error("createAppointment returned null");
  const timeChart = await createTimeChart(userId, "Owner chart");

  const contactId = await createContact(userId, {
    givenName: "Owner",
    familyName: "Person",
  });
  await createDiscussionItem(userId, contactId, { name: "Owner topic" });

  const resourceId = await createResource(userId, { shortName: "Owner resource" });

  await importFinanceCsvFiles({
    userId,
    files: [
      {
        name: "Chase9910_Activity.csv",
        text:
          "Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n" +
          "08/10/2026,08/11/2026,OWNER PURCHASE,Shopping,Sale,-10.59,\n",
      },
      {
        name: "20260818-statements-9910-.pdf",
        text: [
          "Payment Due Date: 09/15/26",
          "New Balance: $10.59",
          "Minimum Payment Due: $35.00",
          "www.chase.com/cardhelp",
          "Previous Balance $0.00",
          "Payment, Credits $0.00",
          "Purchases +$10.59",
          "Cash Advances $0.00",
          "Balance Transfers $0.00",
          "Fees Charged $0.00",
          "Interest Charged $0.00",
          "Opening/Closing Date 07/19/26 - 08/18/26",
          "Credit Access Line $7,900",
          "Available Credit $7,889",
          "ACCOUNT ACTIVITY",
          "Statement Date: 08/18/26",
          "08/10 OWNER PURCHASE Amzn.com/bill WA 10.59",
          "Purchases 23.24%(v)(d) - 0 - - 0 -",
        ].join("\n"),
      },
    ],
  });
  const [financeAccount] = await listAccounts(userId);
  const [financeTransaction] = await listTransactions(userId);
  const [financeStatement] = await listStatements(userId);
  if (!financeAccount || !financeTransaction || !financeStatement) {
    throw new Error(
      "expected the finance seed to create an account, row, and statement",
    );
  }
  await upsertRecurringBill(userId, {
    merchant: "Owner Insurance",
    cadenceMonths: 6,
    expectedCents: 141_260,
  });
  await importFinanceCsvFiles({
    userId,
    files: [
      {
        name: "statement-Apr-2025.pdf",
        text: [
          "Statement Period PayPal Account ID",
          "PAYPAL ACCOUNT",
          "ACCOUNT ACTIVITY",
          "04/20/2025 General Payment: Dennis Raulin",
          "ID: 0LT3288171837814B",
          "USD 2,000.00 0.00 2,000.00",
        ].join("\n"),
      },
    ],
  });
  const [paymentResolution] = await listPaymentResolutions(userId);
  if (!paymentResolution) {
    throw new Error("expected the PayPal seed to create a resolution");
  }
  await importAmazonSlim({
    userId,
    text: JSON.stringify({
      version: SLIM_VERSION,
      source: SLIM_SOURCE,
      generatedAt: "2026-08-14T18:00:00.000Z",
      orders: [
        {
          amazonOrderId: "114-owner",
          channel: "retail",
          orderDate: "2026-03-30",
          orderStatus: "Closed",
          paymentMethod: "Visa - 9910",
          paymentLast4: "9910",
          website: "Amazon.com",
          currency: "USD",
        },
      ],
      items: [
        {
          lineId: "114-owner:B00OWN:0",
          amazonOrderId: "114-owner",
          channel: "retail",
          asin: "B00OWN",
          productName: "Owner paper",
          quantity: 1,
          unitPriceCents: 630,
          unitPriceTaxCents: 0,
          itemPaidCents: 630,
          itemTaxCents: 0,
          discountsCents: 0,
          shippingChargeCents: 0,
          shippingOption: "std-sns-us",
          shipmentStatus: "Shipped",
          subscribeAndSave: true,
          shipDate: "2026-03-31",
          orderDate: "2026-03-30",
          orderStatus: "Closed",
          paymentMethod: "Visa - 9910",
          paymentLast4: "9910",
          website: "Amazon.com",
          currency: "USD",
        },
      ],
      refunds: [],
      returns: [],
      replacements: [],
    }),
  });
  const [amazonItem] = await listAmazonItems(userId);
  if (!amazonItem) throw new Error("expected the amazon seed to create an item");

  const plan = await ensureWeeklyPlan(userId, { weekStart: WEEK_START });
  await upsertPlanEntry(userId, plan.id, goalId, { focus: true });

  const exerciseId = await createExercise(userId, "Owner lift");
  const sessionId = await createSession(userId, {
    performedAt: new Date(2026, 2, 11, 18, 0),
    title: "Owner session",
    exercises: [{ exerciseId, sets: [{ reps: 5, weight: 100, unit: "lb" }] }],
  });

  const dayItemId = await createDailyItem({
    userId,
    day: DAY,
    title: "Owner day line",
    nodeId: taskId,
  });
  await saveJournal(userId, DAY, "owner journal");

  await writeUserSetting(userId, "shell", { v: 2, sidebarCollapsed: true });

  return {
    userId,
    goalId,
    taskId,
    wishId,
    noteId,
    metricId,
    metricEntryId,
    appointmentId: appointment.id,
    timeChartId: timeChart.id,
    contactId,
    resourceId,
    financeAccountId: financeAccount.id,
    financeTransactionId: financeTransaction.id,
    financeStatementId: financeStatement.id,
    paymentResolutionId: paymentResolution.id,
    amazonItemId: amazonItem.id,
    planId: plan.id,
    exerciseId,
    sessionId,
    dayItemId,
    day: DAY,
    weekStart: WEEK_START,
  };
}

describeDb("a second user reads none of the first user's rows", () => {
  let owner: Owned;
  let intruder: string;

  beforeAll(async () => {
    owner = await seedOwner();
    intruder = await makeUser();
  });

  /**
   * The owner really does have all of this. Without this check every assertion below would
   * also pass against an empty database, which is the way a cross-user test quietly stops
   * testing anything.
   */
  it("the owner sees their own rows", async () => {
    expect((await loadOutline(owner.userId)).length).toBeGreaterThan(0);
    expect((await loadNotes(owner.userId)).length).toBeGreaterThan(0);
    expect((await listMetrics(owner.userId)).length).toBeGreaterThan(0);
    expect(await getMetricEntry(owner.userId, owner.metricEntryId)).not.toBeNull();
    expect(await getAppointment(owner.userId, owner.appointmentId)).not.toBeNull();
    expect((await listTimeCharts(owner.userId)).length).toBeGreaterThan(0);
    expect((await loadContacts(owner.userId)).length).toBeGreaterThan(0);
    expect((await listResources(owner.userId)).length).toBeGreaterThan(0);
    expect((await listAccounts(owner.userId)).length).toBeGreaterThan(0);
    expect((await listTransactions(owner.userId)).length).toBeGreaterThan(0);
    expect((await listAmazonItems(owner.userId)).length).toBeGreaterThan(0);
    expect((await listStatements(owner.userId)).length).toBeGreaterThan(0);
    expect((await listPaymentResolutions(owner.userId)).length).toBeGreaterThan(0);
    expect((await loadInsightsRows(owner.userId)).length).toBeGreaterThan(0);
    expect(await getWeeklyPlanById(owner.userId, owner.planId)).toBeTruthy();
    expect((await listExercises(owner.userId)).length).toBeGreaterThan(0);
    expect((await listSessions(owner.userId)).length).toBeGreaterThan(0);
    expect((await loadDay(owner.userId, owner.day)).items.length).toBeGreaterThan(0);
    expect(await loadNodeDetail(owner.userId, owner.taskId)).not.toBeNull();
  });

  it("the outline and node detail", async () => {
    expect(await loadOutline(intruder)).toEqual([]);
    expect(await loadNodeDetail(intruder, owner.taskId)).toBeNull();
    expect(await loadNodeDetail(intruder, owner.goalId)).toBeNull();
  });

  it("notes", async () => {
    expect(await loadNotes(intruder)).toEqual([]);
    // Reachable by id from a shared link, so it must refuse by user and not only by parent.
    expect(await loadNotesForNode(intruder, owner.taskId)).toEqual([]);
    expect(await loadDiarySummaries(intruder)).toEqual([]);
  });

  it("the wish list, which reads node_items directly", async () => {
    expect(await loadWishList(intruder)).toEqual([]);
    expect((await loadWishList(owner.userId)).map((row) => row.id)).toContain(
      owner.wishId,
    );
  });

  it("metrics and their tracking entries", async () => {
    expect(await listMetrics(intruder)).toEqual([]);
    expect(await listMetricsForOwner(intruder, owner.goalId)).toEqual([]);
    expect(await getMetricDetail(intruder, owner.metricId)).toBeNull();
    expect(await getMetricEntry(intruder, owner.metricEntryId)).toBeNull();
  });

  it("appointments and time charts", async () => {
    expect(await getAppointment(intruder, owner.appointmentId)).toBeNull();
    expect(await listAppointmentsInRange(intruder, RANGE_FROM, RANGE_TO)).toEqual([]);
    expect(await listTimeCharts(intruder)).toEqual([]);
    expect(await getTimeChart(intruder, owner.timeChartId)).toBeNull();

    // The one query that assembles a whole page rather than a table: appointments, charts
    // and the project tree all reach it through separate calls.
    const schedule = await loadSchedule(intruder, {
      range: weekRange(owner.weekStart),
    });
    expect(schedule.appointments).toEqual([]);
    expect(schedule.charts).toEqual([]);
    expect(schedule.occurrences).toEqual([]);
  });

  it("contacts and their discussion items", async () => {
    expect(await loadContacts(intruder)).toEqual([]);
    expect(await loadContactOptions(intruder)).toEqual([]);
    expect(await getContactDetail(intruder, owner.contactId)).toBeNull();
    expect(await loadDiscussionItems(intruder, owner.contactId)).toEqual([]);
  });

  it("resources", async () => {
    expect(await listResources(intruder)).toEqual([]);
    expect(await getResourceDetail(intruder, owner.resourceId)).toBeNull();
  });

  it("amazon order items", async () => {
    expect(await listAmazonItems(intruder)).toEqual([]);
    expect(await getAmazonItem(intruder, owner.amazonItemId)).toBeNull();
    expect((await listAmazonItems(owner.userId)).map((row) => row.id)).toContain(
      owner.amazonItemId,
    );
  });

  it("finance accounts and transactions", async () => {
    expect(await listAccounts(intruder)).toEqual([]);
    expect(await listTransactions(intruder)).toEqual([]);
    expect(await listStatements(intruder)).toEqual([]);
    expect(await getTransaction(intruder, owner.financeTransactionId)).toBeNull();
    expect(await listPaymentResolutions(intruder)).toEqual([]);
    expect(await getPaymentResolution(intruder, owner.paymentResolutionId)).toBeNull();
    // The filtered read takes an account id the intruder can guess; it must refuse by user
    // rather than trusting that the id belongs to the caller.
    expect(
      await listTransactions(intruder, { accountId: owner.financeAccountId }),
    ).toEqual([]);
    // A total is a read too — a dropped userId here leaks the balance without any row.
    expect(await transactionTotalCents(intruder)).toBe(0);
    expect(
      await transactionTotalCents(intruder, { accountId: owner.financeAccountId }),
    ).toBe(0);
  });

  it("finance insights", async () => {
    // The dashboard loads whole rows rather than aggregates, so a dropped userId here hands
    // over every description and amount at once.
    expect(await loadInsightsRows(intruder)).toEqual([]);
    expect(await loadInsightsRows(intruder, { from: "2000-01-01" })).toEqual([]);
    expect(await unclassifiedCount(intruder)).toBe(0);
    expect(await loadCarryingCost(intruder)).toMatchObject({
      interestCents: 0,
      feesCents: 0,
      byAccount: [],
    });
    expect(await loadRecurringBills(intruder)).toEqual([]);
  });

  it("weekly plans and their entries", async () => {
    expect(await listWeeklyPlans(intruder)).toEqual([]);
    expect(await getWeeklyPlan(intruder, owner.weekStart)).toBeNull();
    expect(await getWeeklyPlanById(intruder, owner.planId)).toBeNull();
    expect(await listPlanEntries(intruder, owner.planId)).toEqual([]);
  });

  it("the fitness log", async () => {
    expect(await listExercises(intruder)).toEqual([]);
    expect(await getExercise(intruder, owner.exerciseId)).toBeNull();
    expect(await listSessions(intruder)).toEqual([]);
    expect(await getSessionDetail(intruder, owner.sessionId)).toBeNull();
    expect(await loadExerciseHistory(intruder, owner.exerciseId)).toEqual([]);
  });

  it("the day list and its journal", async () => {
    const day = await loadDay(intruder, owner.day);
    expect(day.items).toEqual([]);
    expect(await loadJournal(intruder, owner.day)).toBeFalsy();

    // `days` is the seven column keys and is always seven long; `itemsByDay` is the data.
    const week = await loadWeek(intruder, "2026-03-08", "2026-03-14");
    expect(Object.values(week.itemsByDay).flat()).toEqual([]);

    expect(await plannedDayForNode(intruder, owner.taskId)).toBeNull();
    expect((await plannedNodeIds(intruder)).size).toBe(0);
  });

  it("stored view settings", async () => {
    expect(await loadUserSettings(intruder)).toEqual({});
  });
});
