"use server";

import { seedPayees, type SeedPayeesSummary } from "@/lib/finances/payees/backfill";
import {
  addAlias,
  deletePayee,
  mergePayees,
  replaceCommitmentPayees,
  removeAlias,
  setPayeeNotes,
  updatePayeeDetails,
} from "@/lib/finances/payees/mutations";
import {
  listPayees,
  previewPayeeMerge,
  type PayeeMergePreview,
  type PayeeRow,
} from "@/lib/finances/payees/queries";
import {
  clearScrapedPending,
  replaceScrapedPending,
  type ReplaceScrapedPendingResult,
} from "@/lib/finances/scrapePending";
import {
  addMatchersToCommitment,
  deleteAccount,
  deleteCommitment,
  deleteRecurringBill,
  deleteRecurringSpend,
  deleteTransaction,
  reclassifyTransactions,
  renameRecurringBill,
  renameRecurringSpend,
  setOneOff,
  setSubscriptionStatus,
  updateAccount,
  updateTransaction,
  upsertRecurringBill,
  upsertRecurringSpend,
  type AccountEdit,
  type RecurringBillEdit,
  type RecurringSpendEdit,
  type ReclassifySummary,
  type TransactionEdit,
} from "@/lib/finances/mutations";
import {
  addTemplatesFromSchedules,
  applyBudgetTemplates,
  autoMapBudgetCategories,
  createBudgetCategory,
  createCategoryGroup,
  deleteBudgetCategory,
  deleteCategoryGroup,
  performBudgetOperation,
  renameCategoryGroup,
  saveEnvelopeTemplates,
  seedBudget,
  setCarryover,
  setTransactionBudgetCategory,
  updateBudgetCategory,
  type BudgetCategoryEdit,
  type BudgetOperation,
  type SeedResult,
} from "@/lib/finances/budget/mutations";
import type { MonthKey } from "@/lib/finances/budget/envelope";
import type { BudgetPreset } from "@/lib/finances/budget/presets";
import type { CommitmentStatus } from "@/db/schema";
import type { DiscoverProposal } from "@/lib/finances/schedules/discover";
import {
  completeSchedule,
  createSchedule,
  createSchedulesFromDiscover,
  deleteSchedule,
  discoverScheduleProposals,
  findMatches,
  importSchedulesFromBills,
  linkTransaction,
  postScheduleNow,
  skipSchedule,
  unlinkTransaction,
  updateSchedule,
  type ImportFromBillsResult,
  type ScheduleDraft,
  type SchedulePatch,
} from "@/lib/finances/schedules/mutations";
import {
  getSchedule,
  listPostedLinks,
  listScheduleRecords,
  listSchedules,
  type ScheduleListRow,
  type ScheduleRecord,
} from "@/lib/finances/schedules/queries";
import { DEFAULT_UPCOMING_LENGTH } from "@/lib/finances/schedules/status";
import {
  upcomingOccurrences,
  type UpcomingOccurrence,
} from "@/lib/finances/schedules/upcoming";
import { getTransaction, listAccounts, listTransactions } from "@/lib/finances/queries";
import type {
  FinanceAccountRow,
  TransactionFilter,
  TransactionListRow,
} from "@/lib/finances/types";
import {
  run,
  runQuery,
  runWithData,
  type ActionResult,
  type DataActionResult,
  type QueryResult,
} from "../actionResult";

export async function updateTransactionAction(
  transactionId: string,
  edit: TransactionEdit,
): Promise<ActionResult> {
  return run((userId) => updateTransaction(userId, transactionId, edit));
}

export async function deleteTransactionAction(
  transactionId: string,
): Promise<ActionResult> {
  return run((userId) => deleteTransaction(userId, transactionId));
}

export async function updateAccountAction(
  accountId: string,
  edit: AccountEdit,
): Promise<ActionResult> {
  return run((userId) => updateAccount(userId, accountId, edit));
}

export async function deleteAccountAction(accountId: string): Promise<ActionResult> {
  return run((userId) => deleteAccount(userId, accountId));
}

export async function listTransactionsAction(
  filter?: TransactionFilter,
): Promise<QueryResult<TransactionListRow[]>> {
  return runQuery((userId) => listTransactions(userId, filter));
}

export async function listAccountsAction(): Promise<QueryResult<FinanceAccountRow[]>> {
  return runQuery(listAccounts);
}

export async function reclassifyAction(): Promise<DataActionResult<ReclassifySummary>> {
  return runWithData(reclassifyTransactions);
}

export async function setOneOffAction(
  transactionIds: readonly string[],
  edit: { excludeFromBaseline: boolean; eventLabel?: string },
): Promise<ActionResult> {
  return run((userId) => setOneOff(userId, transactionIds, edit));
}

export async function setRecurringBillAction(
  edit: RecurringBillEdit,
): Promise<ActionResult> {
  return run((userId) => upsertRecurringBill(userId, edit));
}

export async function deleteRecurringBillAction(
  merchant: string,
): Promise<ActionResult> {
  return run((userId) => deleteRecurringBill(userId, merchant));
}

export async function setRecurringSpendAction(
  edit: RecurringSpendEdit,
): Promise<ActionResult> {
  return run((userId) => upsertRecurringSpend(userId, edit));
}

export async function setCommitmentPayeesAction(input: {
  kind: "bill" | "spend";
  id: string;
  payeeIds: readonly string[];
}): Promise<ActionResult> {
  return run(async (userId) => {
    await replaceCommitmentPayees(
      userId,
      { kind: input.kind, id: input.id },
      input.payeeIds,
    );
    await reclassifyTransactions(userId);
  });
}

/** Fold another bank spelling into a commitment that already exists, on either tier. */
export async function addCommitmentMatchersAction(input: {
  kind: "bill" | "spend";
  name: string;
  matchers: readonly string[];
}): Promise<ActionResult> {
  return run((userId) => addMatchersToCommitment(userId, input));
}

export async function deleteRecurringSpendAction(name: string): Promise<ActionResult> {
  return run((userId) => deleteRecurringSpend(userId, name));
}

export async function renameRecurringBillAction(
  from: string,
  to: string,
): Promise<ActionResult> {
  return run((userId) => renameRecurringBill(userId, from, to));
}

export async function renameRecurringSpendAction(
  from: string,
  to: string,
): Promise<ActionResult> {
  return run((userId) => renameRecurringSpend(userId, from, to));
}

export async function setSubscriptionStatusAction(
  name: string,
  status: CommitmentStatus,
  options: { reanchorOn?: string; cancelledOn?: string | null } = {},
): Promise<ActionResult> {
  return run((userId) => setSubscriptionStatus(userId, name, status, options));
}

export async function deleteCommitmentAction(target: {
  kind: "bill" | "spend";
  name: string;
}): Promise<ActionResult> {
  return run((userId) => deleteCommitment(userId, target));
}

export async function pasteScrapedPendingAction(
  text: string,
  todayKey: string,
): Promise<DataActionResult<ReplaceScrapedPendingResult>> {
  return runWithData((userId) => replaceScrapedPending(userId, text, todayKey));
}

export async function clearScrapedPendingAction(
  todayKey: string,
): Promise<DataActionResult<ReplaceScrapedPendingResult>> {
  return runWithData((userId) => clearScrapedPending(userId, todayKey));
}

export async function getTransactionAction(
  transactionId: string,
): Promise<QueryResult<TransactionListRow | null>> {
  return runQuery((userId) => getTransaction(userId, transactionId));
}

// ─────────────────────────── Envelope budget ───────────────────────────

export async function seedBudgetAction(
  preset: BudgetPreset,
  todayKey: string,
): Promise<DataActionResult<SeedResult>> {
  return runWithData(async (userId) => {
    const result = await seedBudget(userId, { preset, todayKey });
    // Setup is only finished when the grid has numbers in it, so the two run together
    // rather than leaving the user on an empty budget wondering what to do next.
    await autoMapBudgetCategories(userId, result.startMonth);
    return result;
  });
}

export async function autoMapBudgetAction(
  since: string,
): Promise<DataActionResult<{ placed: number; remaining: number }>> {
  return runWithData((userId) => autoMapBudgetCategories(userId, since));
}

export async function budgetOperationAction(
  operation: BudgetOperation,
): Promise<ActionResult> {
  return run((userId) => performBudgetOperation(userId, operation));
}

export async function setCarryoverAction(
  month: string,
  categoryId: string,
  carryover: boolean,
): Promise<ActionResult> {
  return run((userId) => setCarryover(userId, { month, categoryId, carryover }));
}

export async function createCategoryGroupAction(
  name: string,
  isIncome: boolean,
): Promise<DataActionResult<string>> {
  return runWithData((userId) => createCategoryGroup(userId, { name, isIncome }));
}

export async function renameCategoryGroupAction(
  groupId: string,
  name: string,
): Promise<ActionResult> {
  return run((userId) => renameCategoryGroup(userId, groupId, name));
}

export async function deleteCategoryGroupAction(
  groupId: string,
): Promise<ActionResult> {
  return run((userId) => deleteCategoryGroup(userId, groupId));
}

export async function createBudgetCategoryAction(
  groupId: string,
  name: string,
): Promise<DataActionResult<string>> {
  return runWithData((userId) => createBudgetCategory(userId, { groupId, name }));
}

export async function updateBudgetCategoryAction(
  categoryId: string,
  edit: BudgetCategoryEdit,
): Promise<ActionResult> {
  return run((userId) => updateBudgetCategory(userId, categoryId, edit));
}

export async function deleteBudgetCategoryAction(
  categoryId: string,
): Promise<ActionResult> {
  return run((userId) => deleteBudgetCategory(userId, categoryId));
}

export async function setTransactionBudgetCategoryAction(
  transactionId: string,
  categoryId: string | null,
): Promise<ActionResult> {
  return run((userId) =>
    setTransactionBudgetCategory(userId, transactionId, categoryId),
  );
}

export async function saveEnvelopeTemplatesAction(
  categoryId: string,
  templates: unknown,
): Promise<ActionResult> {
  return run((userId) => saveEnvelopeTemplates(userId, categoryId, templates));
}

export async function applyBudgetTemplatesAction(
  month: MonthKey,
  force: boolean,
  categoryIds?: readonly string[],
): Promise<DataActionResult<{ applied: number; errors: string[] }>> {
  return runWithData((userId) =>
    applyBudgetTemplates(userId, { month, force, categoryIds }),
  );
}

export async function addTemplatesFromSchedulesAction(
  categoryId?: string,
  scheduleIds?: readonly string[],
): Promise<DataActionResult<{ added: number; categoryId: string }>> {
  return runWithData((userId) =>
    addTemplatesFromSchedules(userId, { categoryId, scheduleIds }),
  );
}

// ─────────────────────────── Schedules ───────────────────────────

export async function listSchedulesAction(
  todayKey: string,
  horizon?: string,
): Promise<QueryResult<ScheduleListRow[]>> {
  return runQuery((userId) => listSchedules(userId, todayKey, horizon));
}

export async function getScheduleAction(
  scheduleId: string,
): Promise<QueryResult<ScheduleRecord | null>> {
  return runQuery((userId) => getSchedule(userId, scheduleId));
}

export async function createScheduleAction(
  draft: ScheduleDraft,
  todayKey: string,
): Promise<DataActionResult<string>> {
  return runWithData((userId) => createSchedule(userId, draft, todayKey));
}

export async function updateScheduleAction(
  scheduleId: string,
  patch: SchedulePatch,
  todayKey: string,
): Promise<ActionResult> {
  return run((userId) => updateSchedule(userId, scheduleId, patch, todayKey));
}

export async function deleteScheduleAction(scheduleId: string): Promise<ActionResult> {
  return run((userId) => deleteSchedule(userId, scheduleId));
}

export async function skipScheduleAction(scheduleId: string): Promise<ActionResult> {
  return run((userId) => skipSchedule(userId, scheduleId));
}

export async function completeScheduleAction(
  scheduleId: string,
  completed: boolean,
): Promise<ActionResult> {
  return run((userId) => completeSchedule(userId, scheduleId, completed));
}

export async function postScheduleNowAction(
  scheduleId: string,
): Promise<DataActionResult<string>> {
  return runWithData((userId) => postScheduleNow(userId, scheduleId));
}

export async function importSchedulesFromBillsAction(
  todayKey: string,
): Promise<DataActionResult<ImportFromBillsResult>> {
  return runWithData((userId) => importSchedulesFromBills(userId, todayKey));
}

export async function findScheduleMatchesAction(): Promise<
  DataActionResult<{ linked: number }>
> {
  return runWithData((userId) => findMatches(userId));
}

export async function linkTransactionAction(
  scheduleId: string,
  transactionId: string,
): Promise<ActionResult> {
  return run((userId) => linkTransaction(userId, scheduleId, transactionId));
}

export async function unlinkTransactionAction(
  transactionId: string,
): Promise<ActionResult> {
  return run((userId) => unlinkTransaction(userId, transactionId));
}

export async function discoverSchedulesAction(): Promise<
  QueryResult<DiscoverProposal[]>
> {
  return runQuery((userId) => discoverScheduleProposals(userId));
}

export async function createDiscoveredSchedulesAction(
  proposals: DiscoverProposal[],
  todayKey: string,
): Promise<DataActionResult<number>> {
  return runWithData((userId) =>
    createSchedulesFromDiscover(userId, proposals, todayKey),
  );
}

export async function upcomingOccurrencesAction(
  todayKey: string,
  horizon: string = DEFAULT_UPCOMING_LENGTH,
): Promise<QueryResult<UpcomingOccurrence[]>> {
  return runQuery(async (userId) => {
    const records = await listScheduleRecords(userId);
    const links = await listPostedLinks(
      userId,
      records.map((row) => row.id),
    );
    return upcomingOccurrences(records, links, horizon, todayKey);
  });
}

// ─────────────────────────────── Payees ───────────────────────────────
//
// Claims are now populated by the guarded matcher bridge. The id-authoritative cutover exposes
// merge here because it rewrites every payee reference transactionally rather than changing a
// display string that business logic joins on.

export async function listPayeesAction(): Promise<QueryResult<PayeeRow[]>> {
  return runQuery(listPayees);
}

export async function seedPayeesAction(): Promise<DataActionResult<SeedPayeesSummary>> {
  return runWithData(seedPayees);
}

export async function addPayeeAliasAction(
  payeeId: string,
  alias: string,
): Promise<ActionResult> {
  return run((userId) => addAlias(userId, payeeId, alias));
}

export async function removePayeeAliasAction(
  payeeId: string,
  alias: string,
): Promise<ActionResult> {
  return run((userId) => removeAlias(userId, payeeId, alias));
}

export async function setPayeeNotesAction(
  payeeId: string,
  notes: string,
): Promise<ActionResult> {
  return run((userId) => setPayeeNotes(userId, payeeId, notes));
}

export async function updatePayeeDetailsAction(
  payeeId: string,
  input: { name: string; notes: string },
): Promise<ActionResult> {
  return run((userId) => updatePayeeDetails(userId, payeeId, input));
}

export async function deletePayeeAction(payeeId: string): Promise<ActionResult> {
  return run((userId) => deletePayee(userId, payeeId));
}

export async function previewPayeeMergeAction(
  targetId: string,
  sourceIds: readonly string[],
): Promise<QueryResult<PayeeMergePreview>> {
  return runQuery((userId) => previewPayeeMerge(userId, targetId, sourceIds));
}

export async function mergePayeesAction(
  targetId: string,
  sourceIds: readonly string[],
): Promise<DataActionResult<{ movedTransactions: number; movedAliases: number }>> {
  return runWithData((userId) => mergePayees(userId, targetId, sourceIds));
}
