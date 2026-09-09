import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createInvite, listInvites } from "@/lib/auth/invites";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";

import { createNode } from "@/lib/tree/mutations";
import { loadOutline } from "@/lib/tree/queries";
import { createNodeItem, saveNodeDetail } from "@/lib/detail/mutations";
import { listResultAreas, loadNodeDetail } from "@/lib/detail/queries";
import { loadWishList } from "@/lib/detail/wishQueries";
import { createNote } from "@/lib/notes/mutations";
import {
  loadDiarySummaries,
  loadNote,
  loadNoteSummaries,
  loadNoteSummary,
  loadNotes,
  loadNotesForContact,
  loadNotesListPayload,
  loadNotesForNode,
  noteOwnedBy,
} from "@/lib/notes/queries";
import { createMetric, createMetricEntry } from "@/lib/metrics/mutations";
import {
  getMetricDetail,
  getMetricEntry,
  listMetrics,
  listMetricsForOwner,
} from "@/lib/metrics/queries";
import {
  createAppointment,
  createTimeChart,
  createTimeChartArea,
} from "@/lib/schedule/mutations";
import {
  getAppointment,
  getTimeChart,
  listAppointmentsInRange,
  listTimeChartAreas,
  listTimeChartSummaries,
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
import { approveAmazonChargeMatch } from "@/lib/amazon/apply";
import { importAmazonSlim } from "@/lib/amazon/import";
import { persistAmazonSnapshot } from "@/lib/amazon/reconcile";
import {
  countAmazonItems,
  getAmazonCharge,
  getAmazonChargeMatch,
  getAmazonItem,
  getAmazonSubscription,
  listAmazonCharges,
  listAmazonItems,
  listAmazonChargeOrders,
  listAmazonItemsByIds,
  listAmazonOrderSummaries,
  listAmazonReceiptAllocations,
  loadAmazonBlock,
  listAmazonSubscriptions,
} from "@/lib/amazon/queries";
import { SNAPSHOT_SOURCE, SNAPSHOT_VERSION } from "@/lib/amazon/snapshot";
import { SLIM_SOURCE, SLIM_VERSION } from "@/lib/amazon/types";
import { importFinanceCsvFiles } from "@/lib/finances/import";
import {
  loadCarryingCost,
  loadDashboard,
  loadInsightsRows,
  loadRecurringBills,
  unclassifiedCount,
} from "@/lib/finances/dashboardQueries";
import { createCategoryGroup } from "@/lib/finances/budget/mutations";
import { splitTransaction, upsertBillEnvelope } from "@/lib/finances/mutations";
import { claimPayeeForCommitment } from "@/lib/finances/payees/mutations";
import {
  aliasesOf,
  getPayee,
  listAliasRows,
  listPayees,
  payeeEvidenceForCategory,
  payeesForCommitment,
} from "@/lib/finances/payees/queries";
import {
  getPaymentResolution,
  getTransaction,
  listAccounts,
  listPaymentResolutions,
  listSplitChildren,
  loadRegisterBlock,
  listStatements,
  listTransactions,
  listTransactionsByIds,
  transactionTotalCents,
} from "@/lib/finances/queries";
import {
  listFinanceAuditEvents,
  loadFinanceAuditEvent,
} from "@/lib/finances/audit/queries";
import { linkAccount, saveConnection } from "@/lib/banksync/mutations";
import {
  existingRowsInWindow,
  knownExternalIds,
  newestTransactionDate,
  linkableAccounts,
  listConnections,
  listLinks,
  loadConnectionsForSync,
} from "@/lib/banksync/queries";
import { ensureWeeklyPlan, upsertPlanEntry } from "@/lib/planning/mutations";
import {
  getWeeklyPlan,
  getWeeklyPlanById,
  listPlanEntries,
  listWeeklyPlans,
} from "@/lib/planning/queries";
import { loadFindCorpus } from "@/lib/find/queries";
import { FIND_FIELD_CLASSES, FIND_SOURCE_IDS } from "@/lib/find/types";
import { createExercise, createSession } from "@/lib/fitness/mutations";
import {
  getExercise,
  getSessionDetail,
  latestSessionByTitle,
  listExercises,
  listRepeatableTitles,
  listSessions,
  loadExerciseHistory,
  loadLatestForExercise,
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
import { loadUserSettings, readSetting } from "@/lib/settings/queries";
import { createJob } from "@/lib/jobs/mutations";
import { getJobDetail, listJobDates, listJobs } from "@/lib/jobs/queries";
import { createResidence } from "@/lib/residences/mutations";
import {
  getResidenceDetail,
  listResidenceDates,
  listResidences,
} from "@/lib/residences/queries";
import { createLifeEvent } from "@/lib/timeline/mutations";
import { getLifeEvent, listLifeEvents } from "@/lib/timeline/queries";

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
  bankConnectionId: string;
  financeTransactionId: string;
  financePayeeId: string;
  financeStatementId: string;
  billEnvelopeId: string;
  paymentResolutionId: string;
  amazonItemId: string;
  amazonSubscriptionId: string;
  amazonChargeId: string;
  planId: string;
  exerciseId: string;
  sessionId: string;
  dayItemId: string;
  day: string;
  weekStart: Date;
  jobId: string;
  residenceId: string;
  lifeEventId: string;
  inviteId: string;
};

const DAY = "2026-03-11";
const WEEK_START = new Date(2026, 2, 8);
const RANGE_FROM = new Date(2026, 2, 1);
const RANGE_TO = new Date(2026, 2, 31);

async function seedOwner(): Promise<Owned> {
  const userId = await makeUser();
  await db.update(users).set({ canInvite: true }).where(eq(users.id, userId));
  const invite = await createInvite(userId);

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
  // The chart's areas are their own table with their own `user_id`; without one the
  // `listTimeChartAreas` isolation check would pass against an empty table.
  await createTimeChartArea(userId, timeChart.id, {
    name: "Owner block",
    daysOfWeek: [1, 3],
    startMinute: 9 * 60,
    durationMinutes: 60,
  });

  const contactId = await createContact(userId, {
    givenName: "Owner",
    familyName: "Person",
  });
  await createDiscussionItem(userId, contactId, { name: "Owner topic" });
  await createNote({
    userId,
    values: { title: "Owner contact note", contactId },
  });

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
  // Split children are ordinary rows with a `parent_id`, read by their own query.
  await splitTransaction(userId, financeTransaction.id, [
    { amountCents: financeTransaction.amountCents - 100, budgetCategoryId: null },
    { amountCents: 100, budgetCategoryId: null },
  ]);

  await createCategoryGroup(userId, { name: "Household", kind: "spending" });
  await upsertBillEnvelope(userId, {
    name: "Owner Insurance",
    cadence: { unit: "month", n: 6 },
    expectedCents: 141_260,
  });
  // Import classifies as it writes, so the merchant already has a payee.
  const [financePayee] = await listPayees(userId);
  if (!financePayee) {
    throw new Error("expected the finance seed to mint a payee");
  }
  const financePayeeId = financePayee.id;
  const [billEnvelope] = await loadRecurringBills(userId);
  if (!billEnvelope) {
    throw new Error("expected the bill envelope seed to create one");
  }
  // A payee claim is what fills `claimed_budget_category_id`, and three reads take the
  // envelope or category id and answer from that column alone. Without a claim the owner
  // side of those assertions is empty and they stop testing anything. The gate refuses to
  // *file* this $10.59 charge against a $1,412.60 six-monthly bill, which is what keeps the
  // rest of the seed's numbers where the other assertions expect them.
  await claimPayeeForCommitment(userId, financePayeeId, { id: billEnvelope.id });
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
  await persistAmazonSnapshot(userId, {
    version: SNAPSHOT_VERSION,
    source: SNAPSHOT_SOURCE,
    generatedAt: "2026-08-27T16:00:00.000Z",
    capturedOn: "2026-08-27",
    completeness: { subscriptions: true, payments: true, orders: true },
    subscriptions: [
      {
        subscriptionId: "sub-owner",
        asin: "B00OWN",
        productName: "Owner paper",
        quantity: 1,
        cadence: { unit: "month", n: 1 },
        cadenceLabel: "Deliver every month",
        nextDeliveryDate: "2026-09-01",
        status: "active",
      },
    ],
    payments: [
      {
        paymentId: "pay-owner",
        date: "2026-08-01",
        amountCents: -630,
        status: "completed",
        cardLast4: "9910",
        instrumentKind: "card",
        amazonOrderIds: ["114-owner"],
      },
    ],
    orders: [],
    items: [],
  });
  const [amazonSubscription] = await listAmazonSubscriptions(userId);
  const [amazonCharge] = await listAmazonCharges(userId);
  if (!amazonSubscription || !amazonCharge) {
    throw new Error("expected the amazon snapshot seed to create evidence");
  }
  // A charge matched to a register row is what puts a row in `amazon_charge_matches` and
  // `amazon_receipt_allocations`; without one, both of their reads would answer the owner
  // with nothing and the isolation checks would pass against an empty table. The ledger row
  // has to be an Amazon merchant of exactly the charge's amount, which is what
  // `canManuallyMatch` approves.
  await importFinanceCsvFiles({
    userId,
    files: [
      {
        name: "Chase9910_Amazon.csv",
        text:
          "Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n" +
          "08/01/2026,08/02/2026,AMZN Mktp US*OWNER1,Shopping,Sale,-6.30,\n",
      },
    ],
  });
  const amazonLedgerRow = (await listTransactions(userId)).find((row) =>
    row.description.includes("AMZN Mktp"),
  );
  if (!amazonLedgerRow) {
    throw new Error("expected the Amazon ledger seed to import a row");
  }
  await approveAmazonChargeMatch(userId, amazonCharge.id, amazonLedgerRow.id);

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

  const jobId = await createJob(userId, {
    employer: "Owner job",
    startDate: "2019-03-01",
  });
  const residenceId = await createResidence(userId, {
    city: "Owner city",
    movedIn: "2014-08-01",
  });
  const lifeEventId = await createLifeEvent(userId, {
    eventDate: "2010-05-04",
    title: "Owner event",
  });

  await writeUserSetting(userId, "shell", { v: 2, sidebarCollapsed: true });

  const bankConnectionId = await saveConnection(userId, {
    accessUrl: `https://user:owner-bank-secret@example.test/${userId}`,
    label: "Owner Bank",
  });
  await linkAccount(userId, {
    connectionId: bankConnectionId,
    externalAccountId: `sfin-acct-${userId}`,
    accountId: financeAccount.id,
  });

  return {
    bankConnectionId,
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
    financePayeeId,
    financeStatementId: financeStatement.id,
    billEnvelopeId: billEnvelope.id,
    paymentResolutionId: paymentResolution.id,
    amazonItemId: amazonItem.id,
    amazonSubscriptionId: amazonSubscription.id,
    amazonChargeId: amazonCharge.id,
    planId: plan.id,
    exerciseId,
    sessionId,
    dayItemId,
    day: DAY,
    weekStart: WEEK_START,
    jobId,
    residenceId,
    lifeEventId,
    inviteId: invite.id,
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
    expect((await listPayees(owner.userId)).map((row) => row.id)).toContain(
      owner.financePayeeId,
    );
    expect((await listAmazonItems(owner.userId)).length).toBeGreaterThan(0);
    expect((await listStatements(owner.userId)).length).toBeGreaterThan(0);
    expect((await listPaymentResolutions(owner.userId)).length).toBeGreaterThan(0);
    expect((await loadInsightsRows(owner.userId)).length).toBeGreaterThan(0);
    expect(await getWeeklyPlanById(owner.userId, owner.planId)).toBeTruthy();
    expect((await listExercises(owner.userId)).length).toBeGreaterThan(0);
    expect((await listSessions(owner.userId)).length).toBeGreaterThan(0);
    expect((await loadDay(owner.userId, owner.day)).items.length).toBeGreaterThan(0);
    expect(await loadNodeDetail(owner.userId, owner.taskId)).not.toBeNull();
    expect((await listJobs(owner.userId)).length).toBeGreaterThan(0);
    expect((await listResidences(owner.userId)).length).toBeGreaterThan(0);
    expect((await listLifeEvents(owner.userId)).length).toBeGreaterThan(0);
    expect((await listInvites(owner.userId)).map((row) => row.id)).toContain(
      owner.inviteId,
    );
    expect(
      corpusRowCount(
        await loadFindCorpus(owner.userId, FIND_SOURCE_IDS, FIND_FIELD_CLASSES),
      ),
    ).toBeGreaterThan(0);
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
    expect(await loadNoteSummaries(intruder)).toEqual([]);
    // The three single-note reads are the ones a guessed `?note=` reaches. `noteOwnedBy`
    // is the ownership gate itself, so it is the one that must never answer from the id
    // alone.
    expect(await loadNote(intruder, owner.noteId)).toBeNull();
    expect(await loadNoteSummary(intruder, owner.noteId)).toBeNull();
    expect(await noteOwnedBy(intruder, owner.noteId)).toBe(false);
    expect(await loadNotesForContact(intruder, owner.contactId)).toEqual([]);
    expect((await loadNotesForContact(owner.userId, owner.contactId)).length).toBe(1);
    expect(await noteOwnedBy(owner.userId, owner.noteId)).toBe(true);
    expect(await loadNote(owner.userId, owner.noteId)).not.toBeNull();
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
    expect(await listTimeChartSummaries(intruder)).toEqual([]);
    // The areas read takes a chart id the intruder can guess and never joins the chart
    // row, so it has to refuse on its own `user_id`.
    expect(await listTimeChartAreas(intruder, owner.timeChartId)).toEqual([]);
    expect(
      (await listTimeChartAreas(owner.userId, owner.timeChartId)).length,
    ).toBeGreaterThan(0);

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

  it("invites", async () => {
    expect(await listInvites(intruder)).toEqual([]);
  });

  it("amazon order items", async () => {
    expect(await listAmazonItems(intruder)).toEqual([]);
    expect(await getAmazonItem(intruder, owner.amazonItemId)).toBeNull();
    expect((await listAmazonItems(owner.userId)).map((row) => row.id)).toContain(
      owner.amazonItemId,
    );
    expect(await listAmazonSubscriptions(intruder)).toEqual([]);
    expect(await listAmazonCharges(intruder)).toEqual([]);
    expect(
      await getAmazonSubscription(intruder, owner.amazonSubscriptionId),
    ).toBeNull();
    expect(await getAmazonCharge(intruder, owner.amazonChargeId)).toBeNull();
    expect(
      (await listAmazonSubscriptions(owner.userId)).map((row) => row.id),
    ).toContain(owner.amazonSubscriptionId);
  });

  it("amazon reads that take an id the intruder can guess", async () => {
    expect(await listAmazonItemsByIds(intruder, [owner.amazonItemId])).toEqual([]);
    // A count is a read too: it says how much the owner has bought without handing over
    // a row for the row-level checks above to catch.
    expect(await countAmazonItems(intruder)).toBe(0);
    // Both take an id the intruder can guess and neither joins the charge or order row,
    // so each has to refuse on its own `user_id`.
    expect(await listAmazonChargeOrders(intruder, owner.amazonChargeId)).toEqual([]);
    expect(await listAmazonOrderSummaries(intruder)).toEqual([]);
    // Both come back for the owner, so neither passes on an empty table.
    expect(
      (await listAmazonItemsByIds(owner.userId, [owner.amazonItemId])).map(
        (row) => row.id,
      ),
    ).toContain(owner.amazonItemId);
    expect(await countAmazonItems(owner.userId)).toBeGreaterThan(0);
    expect(
      (await listAmazonChargeOrders(owner.userId, owner.amazonChargeId)).length,
    ).toBe(1);
    expect((await listAmazonOrderSummaries(owner.userId)).length).toBe(1);
  });

  it("the receipt a matched charge leaves behind", async () => {
    // Both take the charge id and neither joins the charge row, so each has to refuse on
    // its own `user_id`. The match says which register row the owner's Amazon money went
    // to; the allocation says what it bought, line by line.
    expect(await getAmazonChargeMatch(intruder, owner.amazonChargeId)).toBeNull();
    expect(await listAmazonReceiptAllocations(intruder, owner.amazonChargeId)).toEqual(
      [],
    );
    expect(
      await getAmazonChargeMatch(owner.userId, owner.amazonChargeId),
    ).not.toBeNull();
    expect(
      (await listAmazonReceiptAllocations(owner.userId, owner.amazonChargeId)).length,
    ).toBeGreaterThan(0);
  });

  it("finance accounts and transactions", async () => {
    expect(await listAccounts(intruder)).toEqual([]);
    expect(await listTransactions(intruder)).toEqual([]);
    expect(await listStatements(intruder)).toEqual([]);
    expect(await getTransaction(intruder, owner.financeTransactionId)).toBeNull();
    expect(await listPaymentResolutions(intruder)).toEqual([]);
    expect(await getPaymentResolution(intruder, owner.paymentResolutionId)).toBeNull();
    expect(await listPayees(intruder)).toEqual([]);
    expect(await listAliasRows(intruder)).toEqual([]);
    expect(await getPayee(intruder, owner.financePayeeId)).toBeNull();
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

  it("finance reads that take a transaction id, and the audit trail", async () => {
    expect(await listTransactionsByIds(intruder, [owner.financeTransactionId])).toEqual(
      [],
    );
    expect(
      (await listTransactionsByIds(owner.userId, [owner.financeTransactionId])).map(
        (row) => row.id,
      ),
    ).toContain(owner.financeTransactionId);
    // A split child carries the amount its parent no longer shows, and the query reaches
    // it by the parent id alone.
    expect(await listSplitChildren(intruder, owner.financeTransactionId)).toEqual([]);
    expect(
      (await listSplitChildren(owner.userId, owner.financeTransactionId)).length,
    ).toBe(2);

    // Audit events quote the before/after of every field they changed, so a dropped userId
    // here hands over the amounts even where the transaction read refuses.
    const events = await listFinanceAuditEvents(owner.userId);
    expect(events.length).toBeGreaterThan(0);
    expect(await listFinanceAuditEvents(intruder)).toEqual([]);
    expect(await loadFinanceAuditEvent(intruder, events[0].id)).toBeNull();
    expect(await loadFinanceAuditEvent(owner.userId, events[0].id)).not.toBeNull();
  });

  it("payee routing reads that take an envelope or payee id", async () => {
    // All three answer from a column on `finance_payees` and join nothing that would
    // inherit a refusal — the envelope id, the category id and the payee id are all things
    // an intruder can guess or read out of a URL.
    expect(await payeesForCommitment(intruder, { id: owner.billEnvelopeId })).toEqual(
      [],
    );
    expect(await payeeEvidenceForCategory(intruder, owner.billEnvelopeId)).toEqual([]);
    expect(await aliasesOf(intruder, [owner.financePayeeId])).toEqual([]);

    expect(
      (await payeesForCommitment(owner.userId, { id: owner.billEnvelopeId })).map(
        (row) => row.id,
      ),
    ).toContain(owner.financePayeeId);
    expect(
      (await payeeEvidenceForCategory(owner.userId, owner.billEnvelopeId)).length,
    ).toBeGreaterThan(0);
    expect(
      (await aliasesOf(owner.userId, [owner.financePayeeId])).length,
    ).toBeGreaterThan(0);
  });

  it("bank sync connections, links and their sync windows", async () => {
    // `loadConnectionsForSync` is the one read that carries a bank access token, so a dropped
    // userId here hands over a live credential rather than a row.
    expect(await listConnections(intruder)).toEqual([]);
    expect(await loadConnectionsForSync(intruder)).toEqual([]);
    expect(await listLinks(intruder)).toEqual([]);
    expect(await listLinks(intruder, owner.bankConnectionId)).toEqual([]);
    expect(await linkableAccounts(intruder)).toEqual([]);
    // Both take account ids the intruder can guess; they must refuse by user rather than
    // trusting that the id belongs to the caller.
    expect([...(await knownExternalIds(intruder, [owner.financeAccountId]))]).toEqual(
      [],
    );
    expect(
      (
        await existingRowsInWindow(
          intruder,
          [owner.financeAccountId],
          "2000-01-01",
          "2100-01-01",
        )
      ).size,
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
    expect(await listRepeatableTitles(intruder)).toEqual([]);
    expect(await latestSessionByTitle(intruder, "Owner session")).toBeNull();
    expect(await loadLatestForExercise(intruder, owner.exerciseId)).toBeNull();
    expect(
      await loadLatestForExercise(intruder, owner.exerciseId, {
        sessionTitle: "Owner session",
      }),
    ).toBeNull();
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

  it("jobs, residences, and typed life events", async () => {
    expect(await listJobs(intruder)).toEqual([]);
    expect(await listJobDates(intruder)).toEqual([]);
    expect(await getJobDetail(intruder, owner.jobId)).toBeNull();
    expect(await listResidences(intruder)).toEqual([]);
    expect(await listResidenceDates(intruder)).toEqual([]);
    expect(await getResidenceDetail(intruder, owner.residenceId)).toBeNull();
    expect(await listLifeEvents(intruder)).toEqual([]);
    expect(await getLifeEvent(intruder, owner.lifeEventId)).toBeNull();
  });

  /**
   * `standards/development/security.md`: "When you add a query module, register it in
   * `crossUserReads.integration.test.ts`." These are the page-shaped loaders — the ones a
   * route calls directly — rather than the table reads the blocks above cover.
   */
  it("the block and page loaders a route calls directly", async () => {
    // Both take a list of ids straight from the client, which is the shape that has to
    // refuse by user rather than trusting the id it was handed.
    expect(
      (await loadRegisterBlock(intruder, [owner.financeTransactionId])).rows,
    ).toEqual([]);
    expect((await loadAmazonBlock(intruder, [owner.amazonItemId])).rows).toEqual([]);
    expect(
      (await loadRegisterBlock(owner.userId, [owner.financeTransactionId])).rows.length,
    ).toBe(1);
    expect(
      (await loadAmazonBlock(owner.userId, [owner.amazonItemId])).rows.length,
    ).toBe(1);

    expect(await listJobDates(intruder)).toEqual([]);
    expect(await listResidenceDates(intruder)).toEqual([]);
    expect((await listJobDates(owner.userId)).length).toBe(1);
    expect((await listResidenceDates(owner.userId)).length).toBe(1);

    // The sync window reads an account id the intruder can guess; answering from it would
    // say when the owner last transacted.
    expect(await newestTransactionDate(intruder, [owner.financeAccountId])).toBeNull();
    expect(
      await newestTransactionDate(owner.userId, [owner.financeAccountId]),
    ).not.toBeNull();

    // Two composite loaders assemble several tables into one payload, so the assertion is
    // that the owner's ids appear nowhere in what the intruder gets — and do appear in
    // what the owner gets, which is what stops this passing on an empty database.
    const mentions = (payload: unknown, id: string) =>
      (JSON.stringify(payload) ?? "").includes(id);
    expect(mentions(await loadDashboard(intruder), owner.financeAccountId)).toBe(false);
    expect(mentions(await loadDashboard(owner.userId), owner.financeAccountId)).toBe(
      true,
    );
    expect(mentions(await loadNotesListPayload(intruder, null), owner.noteId)).toBe(
      false,
    );
    expect(mentions(await loadNotesListPayload(owner.userId, null), owner.noteId)).toBe(
      true,
    );
  });

  it("stored view settings", async () => {
    expect(await loadUserSettings(intruder)).toEqual({});
    // The single-scope read is the one every server component calls; the whole-map read
    // being scoped says nothing about it.
    expect(await readSetting(intruder, "shell")).toBeUndefined();
    expect(await readSetting(owner.userId, "shell")).toEqual({
      v: 2,
      sidebarCollapsed: true,
    });
  });

  it("the result-area picker every detail form loads", async () => {
    expect(await listResultAreas(intruder)).toEqual([]);
    expect((await listResultAreas(owner.userId)).length).toBeGreaterThan(0);
  });

  /**
   * Advanced Find reads eighteen tables in one call, four of which (`*_details`) carry no
   * `user_id` at all and inherit ownership through `nodes`. Counting rows across the whole
   * corpus is the assertion that scales: a new source added to `loadFindCorpus` without a
   * `userId` filter fails here without anyone remembering to add a line.
   */
  it("the whole Advanced Find corpus", async () => {
    const corpus = await loadFindCorpus(intruder, FIND_SOURCE_IDS, FIND_FIELD_CLASSES);
    expect(corpusRowCount(corpus)).toBe(0);
  });
});

function corpusRowCount(corpus: Record<string, unknown[]>): number {
  return Object.values(corpus).reduce((total, rows) => total + rows.length, 0);
}
