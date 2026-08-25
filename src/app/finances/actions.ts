"use server";

import { seedPayees, type SeedPayeesSummary } from "@/lib/finances/payees/backfill";
import {
  addAlias,
  deletePayee,
  mergePayees,
  replaceCommitmentPayees,
  removeAlias,
  isolatePayeeForBill,
  setPayeeNotACommitment,
  setPayeeAutoCategory,
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
  deleteTransaction,
  deleteTransactions,
  reclassifyTransactions,
  setOneOff,
  setSubscriptionStatus,
  updateAccount,
  deleteAccount,
  updateTransaction,
  trackTransactionAsBill,
  upsertBillEnvelope,
  type AccountEdit,
  type BillEnvelopeEdit,
  type ReclassifySummary,
  type TransactionEdit,
} from "@/lib/finances/mutations";
import {
  applyBudgetTemplates,
  assignBudget,
  autoMapBudgetCategories,
  autoMapConfiguredBudgetCategories,
  createBudgetCategory,
  createCategoryGroup,
  deleteBudgetCategory,
  deleteCategoryGroup,
  moveBudgetStructureItem,
  moveBudgetStructureItemIntoGroup,
  performBudgetOperation,
  renameCategoryGroup,
  saveEnvelopeTemplates,
  seedBudget,
  setCarryover,
  setTransactionBudgetCategory,
  setTransactionBudgetCategories,
  setTaxonomyCategoryEnvelope,
  updateBudgetCategory,
  type BudgetCategoryEdit,
  type BudgetOperation,
  type SeedResult,
} from "@/lib/finances/budget/mutations";
import type {
  BudgetDropZone,
  BudgetStructureRef,
} from "@/lib/finances/budget/hierarchy";
import type { MonthKey } from "@/lib/finances/budget/envelope";
import type { AssignOption } from "@/lib/finances/budget/assign/types";
import type { BudgetPreset } from "@/lib/finances/budget/presets";
import type { EnvelopeSectionKind, EnvelopeStatus } from "@/db/schema";
import {
  finalizeTransactionIngestion,
  transactionIngestionWatermark,
} from "@/lib/finances/ingestion";
import {
  getTransaction,
  listAccounts,
  listTransactions,
  loadRegisterBlock,
  loadRegisterExportRows,
  loadRegisterPrepared,
  loadTrackAsBillDraft,
} from "@/lib/finances/queries";
import type { TrackAsBillDraft } from "@/lib/finances/registerBillDraft";
import type { RegisterPrepared, RegisterRowBlock } from "@/lib/finances/registerQuery";
import { REGISTER_BLOCK_SIZE } from "@/lib/finances/registerQuery";
import { readSetting } from "@/lib/settings/queries";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { parseBudget } from "@/lib/settings/finances";
import { loadUpcomingBills } from "@/lib/finances/dashboardQueries";
import type { UpcomingBillRow } from "@/lib/finances/commitments";
import type {
  FinanceAccountRow,
  TransactionFilter,
  TransactionListRow,
} from "@/lib/finances/types";
import {
  createFinanceTag,
  deleteFinanceTag,
  discoverFinanceTags,
  updateFinanceTag,
  type FinanceTagEdit,
} from "@/lib/finances/tags/mutations";
import { listFinanceTags, type FinanceTagRow } from "@/lib/finances/tags/queries";
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
  // The Register already holds the row and patches it. A layout revalidate here
  // reloads every transaction and freezes the drawer that just saved.
  return run((userId) => updateTransaction(userId, transactionId, edit), {
    revalidate: [],
  });
}

export async function deleteTransactionAction(
  transactionId: string,
): Promise<ActionResult> {
  return run((userId) => deleteTransaction(userId, transactionId));
}

export async function deleteTransactionsAction(
  transactionIds: readonly string[],
): Promise<ActionResult> {
  return run((userId) => deleteTransactions(userId, transactionIds));
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

async function registerContext(userId: string) {
  const [accounts, storedBudget] = await Promise.all([
    listAccounts(userId),
    readSetting(userId, BUDGET_SCOPE),
  ]);
  return {
    offBudgetAccountIds: new Set(
      accounts.filter((account) => account.offBudget).map((account) => account.id),
    ),
    budgetStartMonth: parseBudget(storedBudget).startMonth,
  };
}

export async function loadRegisterIndexAction(
  query: unknown,
): Promise<QueryResult<RegisterPrepared>> {
  return runQuery(async (userId) =>
    loadRegisterPrepared(userId, query, await registerContext(userId)),
  );
}

export async function loadRegisterBlockAction(
  ids: readonly string[],
): Promise<QueryResult<RegisterRowBlock>> {
  const capped = ids
    .filter((id) => typeof id === "string")
    .slice(0, REGISTER_BLOCK_SIZE);
  return runQuery((userId) => loadRegisterBlock(userId, capped));
}

export async function loadRegisterExportAction(
  query: unknown,
): Promise<QueryResult<TransactionListRow[]>> {
  return runQuery(async (userId) =>
    loadRegisterExportRows(userId, query, await registerContext(userId)),
  );
}

export async function loadTrackAsBillDraftAction(
  transactionId: string,
  todayKey: string,
): Promise<QueryResult<TrackAsBillDraft>> {
  if (typeof transactionId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) {
    return { ok: false, error: "Select a transaction" };
  }
  return runQuery((userId) => loadTrackAsBillDraft(userId, transactionId, todayKey));
}

export async function getTransactionAction(
  transactionId: string,
): Promise<QueryResult<TransactionListRow | null>> {
  if (typeof transactionId !== "string" || transactionId === "") {
    return { ok: false, error: "Select a transaction" };
  }
  return runQuery((userId) => getTransaction(userId, transactionId));
}

export async function listAccountsAction(): Promise<QueryResult<FinanceAccountRow[]>> {
  return runQuery(listAccounts);
}

export async function listFinanceTagsAction(): Promise<QueryResult<FinanceTagRow[]>> {
  return runQuery(listFinanceTags);
}

export async function createFinanceTagAction(
  tag: string,
): Promise<DataActionResult<FinanceTagRow>> {
  return runWithData((userId) => createFinanceTag(userId, { tag }));
}

export async function updateFinanceTagAction(
  tagId: string,
  edit: FinanceTagEdit,
): Promise<ActionResult> {
  return run((userId) => updateFinanceTag(userId, tagId, edit));
}

export async function deleteFinanceTagAction(tagId: string): Promise<ActionResult> {
  return run((userId) => deleteFinanceTag(userId, tagId));
}

export async function discoverFinanceTagsAction(): Promise<
  QueryResult<FinanceTagRow[]>
> {
  return runQuery(discoverFinanceTags);
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
  edit: BillEnvelopeEdit,
): Promise<ActionResult> {
  return run((userId) => upsertBillEnvelope(userId, edit));
}

export async function trackTransactionAsBillAction(
  transactionId: string,
  edit: Omit<BillEnvelopeEdit, "payeeIds">,
): Promise<DataActionResult<{ payeeId: string }>> {
  return runWithData((userId) => trackTransactionAsBill(userId, transactionId, edit));
}

export async function isolatePayeeForBillAction(
  transactionId: string,
): Promise<ActionResult> {
  return run((userId) => isolatePayeeForBill(userId, transactionId), {
    revalidate: [],
  });
}

export async function setCommitmentPayeesAction(input: {
  id: string;
  payeeIds: readonly string[];
}): Promise<ActionResult> {
  return run(async (userId) => {
    await replaceCommitmentPayees(userId, { id: input.id }, input.payeeIds);
    await reclassifyTransactions(userId);
    await autoMapConfiguredBudgetCategories(userId);
  });
}

export async function setSubscriptionStatusAction(
  name: string,
  status: EnvelopeStatus,
  options: { reanchorOn?: string; cancelledOn?: string | null } = {},
): Promise<ActionResult> {
  return run((userId) => setSubscriptionStatus(userId, name, status, options));
}

/** Dismiss (or restore) a Review proposal: this merchant is not a bill. */
export async function setPayeeNotACommitmentAction(
  payeeId: string,
  notACommitment: boolean,
): Promise<ActionResult> {
  return run((userId) => setPayeeNotACommitment(userId, payeeId, notACommitment));
}

export async function pasteScrapedPendingAction(
  text: string,
  todayKey: string,
): Promise<DataActionResult<ReplaceScrapedPendingResult>> {
  return runWithData(async (userId) => {
    const startedAt = await transactionIngestionWatermark();
    const result = await replaceScrapedPending(userId, text, todayKey);
    if (result.inserted > 0) {
      await finalizeTransactionIngestion(userId, {
        applyAutoCategorySince: startedAt,
      });
    }
    return result;
  });
}

export async function clearScrapedPendingAction(
  todayKey: string,
): Promise<DataActionResult<ReplaceScrapedPendingResult>> {
  return runWithData((userId) => clearScrapedPending(userId, todayKey));
}

export async function upcomingBillsAction(
  todayKey: string,
  horizonDays: number,
): Promise<QueryResult<UpcomingBillRow[]>> {
  return runQuery((userId) => loadUpcomingBills(userId, todayKey, horizonDays));
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
  parentGroupId: string | null = null,
): Promise<DataActionResult<string>> {
  return runWithData((userId) => createCategoryGroup(userId, { name, parentGroupId }));
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

export async function moveBudgetStructureItemAction(
  moving: BudgetStructureRef,
  target: BudgetStructureRef,
  zone: BudgetDropZone,
): Promise<ActionResult> {
  return run((userId) => moveBudgetStructureItem(userId, moving, target, zone));
}

export async function moveBudgetStructureItemIntoGroupAction(
  moving: BudgetStructureRef,
  parentGroupId: string | null,
): Promise<ActionResult> {
  return run((userId) =>
    moveBudgetStructureItemIntoGroup(userId, moving, parentGroupId),
  );
}

export async function createBudgetCategoryAction(
  groupId: string | null,
  name: string,
  kind: EnvelopeSectionKind = "spending",
): Promise<DataActionResult<string>> {
  return runWithData((userId) => createBudgetCategory(userId, { groupId, name, kind }));
}

export async function updateBudgetCategoryAction(
  categoryId: string,
  edit: BudgetCategoryEdit,
): Promise<ActionResult> {
  return run((userId) => updateBudgetCategory(userId, categoryId, edit));
}

export async function setTaxonomyCategoryEnvelopeAction(
  sourceCategory: string,
  categoryId: string | null,
): Promise<ActionResult> {
  return run((userId) =>
    setTaxonomyCategoryEnvelope(userId, sourceCategory, categoryId),
  );
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
  return run<string | void>(
    (userId) => setTransactionBudgetCategory(userId, transactionId, categoryId),
    { revalidate: [] },
  );
}

export async function setTransactionBudgetCategoriesAction(
  transactionIds: readonly string[],
  categoryId: string | null,
) {
  return runWithData(
    (userId) => setTransactionBudgetCategories(userId, transactionIds, categoryId),
    { revalidate: [] },
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

export async function assignBudgetAction(
  month: MonthKey,
  option: AssignOption,
  categoryIds?: readonly string[],
): Promise<DataActionResult<{ applied: number; errors: string[] }>> {
  return runWithData((userId) => assignBudget(userId, { month, option, categoryIds }));
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

export async function setPayeeAutoCategoryAction(
  payeeId: string,
  input: {
    mode: "learn" | "fixed" | "off";
    defaultBudgetCategoryId: string | null;
  },
): Promise<ActionResult> {
  return run((userId) => setPayeeAutoCategory(userId, payeeId, input));
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
