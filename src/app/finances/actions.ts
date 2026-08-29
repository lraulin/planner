"use server";

import { seedPayees, type SeedPayeesSummary } from "@/lib/finances/payees/backfill";
import {
  clearPayeeRouting,
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
import { addPayeeAlias } from "@/lib/finances/payees/aliases";
import {
  listPayees,
  payeeEvidenceForCategory,
  previewPayeeMerge,
  type PayeeMergePreview,
  type PayeeRow,
} from "@/lib/finances/payees/queries";
import type { PayeeEvidenceRow } from "@/lib/finances/payees/evidence";
import {
  addSupplyItemFromAmazon,
  addSupplyOptionFromAmazon,
  createSupplyItem,
  createSupplyItemFromSuggestion,
  createSupplyOption,
  deleteSupplyItem,
  deleteSupplyOption,
  mergeSupplyItems,
  previewSupplyMerge,
  setSupplyOptionInUse,
  updateSupplyItem,
  updateSupplyOption,
  type SupplyItemEdit,
  type SupplyItemInput,
  type SupplyMergePreview,
  type SupplyOptionEdit,
  type SupplyOptionInput,
} from "@/lib/finances/supplies/mutations";
import {
  listAmazonRepeatPurchases,
  listSupplyItems,
  type SupplyItemRow,
} from "@/lib/finances/supplies/queries";
import {
  supplySuggestions,
  type SupplySuggestion,
} from "@/lib/finances/supplies/suggestions";
import {
  applyBankBrowserSnapshot,
  type BankSnapshotApplyResult,
} from "@/lib/finances/bankSnapshotApply";
import {
  deleteTransaction,
  deleteTransactions,
  reclassifyTransactions,
  setOneOff,
  setSubscriptionStatus,
  updateAccount,
  deleteAccount,
  updateTransaction,
  splitTransaction,
  unsplitTransaction,
  updateSplitChildren,
  trackTransactionAsBill,
  upsertBillEnvelope,
  type AccountEdit,
  type BillEnvelopeEdit,
  type ReclassifySummary,
  type SplitChildInput,
  type TransactionEdit,
} from "@/lib/finances/mutations";
import {
  applyBudgetTemplates,
  assignBudget,
  autoMapBudgetCategories,
  autoMapConfiguredBudgetCategories,
  createBudgetCategory,
  createCategoryGroup,
  fileWaitingChargesForPayee,
  deleteBudgetCategory,
  deleteCategoryGroup,
  moveBudgetStructureItem,
  moveBudgetStructureItemIntoGroup,
  performBudgetOperation,
  renameCategoryGroup,
  saveEnvelopeTarget,
  seedBudget,
  setCarryover,
  setTargetSnooze,
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
import type { EnvelopeKind, EnvelopeStatus } from "@/db/schema";
import {
  getTransaction,
  listAccounts,
  listSplitChildren,
  listTransactions,
  loadRegisterBlock,
  loadRegisterExportRows,
  loadRegisterPrepared,
  loadTrackAsBillDraft,
} from "@/lib/finances/queries";
import type { TrackAsBillDraft } from "@/lib/finances/registerBillDraft";
import {
  listFinanceAuditEvents,
  loadFinanceAuditEvent,
} from "@/lib/finances/audit/queries";
import type {
  FinanceAuditEvent,
  FinanceAuditEventSummary,
} from "@/lib/finances/audit/types";
import type { RegisterPrepared, RegisterRowBlock } from "@/lib/finances/registerQuery";
import { parseRegisterQuery, REGISTER_BLOCK_SIZE } from "@/lib/finances/registerQuery";
import { loadWorkingPendingSelection } from "@/lib/finances/workingPendingQuery";
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
  applyAmazonSnapshotText,
  approveAmazonChargeMatch,
  listAmazonChargeCandidates,
  previewAmazonSnapshotText,
  type AmazonChargeCandidate,
  type AmazonSnapshotApplyResult,
} from "@/lib/amazon/apply";
import type { AmazonPreview } from "@/lib/amazon/preview";
import {
  loadAmazonBlock,
  loadAmazonExportRows,
  loadAmazonPrepared,
  listAmazonReviewItems,
  type AmazonReviewRow,
} from "@/lib/amazon/queries";
import {
  AMAZON_BLOCK_SIZE,
  type AmazonOrdersPrepared,
  type AmazonOrdersRowBlock,
} from "@/lib/amazon/ordersQuery";
import type { AmazonItemListRow } from "@/lib/amazon/types";
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

async function registerContext(userId: string, rawQuery?: unknown) {
  const [accounts, storedBudget] = await Promise.all([
    listAccounts(userId),
    readSetting(userId, BUDGET_SCOPE),
  ]);
  const parsed = rawQuery !== undefined ? parseRegisterQuery(rawQuery) : null;
  const supersededPendingIds =
    parsed?.viewId === "activity"
      ? new Set(
          (
            await loadWorkingPendingSelection(
              userId,
              accounts.map((account) => ({
                id: account.id,
                scrapeBalanceAsOf: account.scrapeBalanceAsOf,
              })),
            )
          ).supersededTransactionIds,
        )
      : undefined;
  return {
    offBudgetAccountIds: new Set(
      accounts.filter((account) => account.offBudget).map((account) => account.id),
    ),
    budgetStartMonth: parseBudget(storedBudget).startMonth,
    supersededPendingIds,
  };
}

export async function loadRegisterIndexAction(
  query: unknown,
): Promise<QueryResult<RegisterPrepared>> {
  return runQuery(async (userId) =>
    loadRegisterPrepared(userId, query, await registerContext(userId, query)),
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
    loadRegisterExportRows(userId, query, await registerContext(userId, query)),
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

export async function listSplitChildrenAction(
  parentId: string,
): Promise<QueryResult<TransactionListRow[]>> {
  if (typeof parentId !== "string" || parentId === "") {
    return { ok: false, error: "Select a transaction" };
  }
  return runQuery((userId) => listSplitChildren(userId, parentId));
}

export async function splitTransactionAction(
  transactionId: string,
  children: readonly SplitChildInput[],
): Promise<ActionResult> {
  // Same reasoning as `updateTransactionAction`: the Register refetches the one row's
  // children itself, and a layout revalidate would reload the whole ledger under the drawer.
  return run((userId) => splitTransaction(userId, transactionId, children), {
    revalidate: [],
  });
}

export async function updateSplitChildrenAction(
  transactionId: string,
  children: readonly SplitChildInput[],
): Promise<ActionResult> {
  return run((userId) => updateSplitChildren(userId, transactionId, children), {
    revalidate: [],
  });
}

export async function unsplitTransactionAction(
  transactionId: string,
): Promise<ActionResult> {
  return run((userId) => unsplitTransaction(userId, transactionId), { revalidate: [] });
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

export async function pasteBankSnapshotAction(
  text: string,
): Promise<DataActionResult<BankSnapshotApplyResult>> {
  return runWithData((userId) => applyBankBrowserSnapshot(userId, text));
}

export async function upcomingBillsAction(
  todayKey: string,
  horizonDays: number,
): Promise<QueryResult<UpcomingBillRow[]>> {
  return runQuery((userId) => loadUpcomingBills(userId, todayKey, horizonDays));
}

export async function listFinanceActivityAction(): Promise<
  QueryResult<FinanceAuditEventSummary[]>
> {
  return runQuery((userId) => listFinanceAuditEvents(userId));
}

export async function loadFinanceActivityEventAction(
  eventId: string,
): Promise<QueryResult<FinanceAuditEvent | null>> {
  return runQuery((userId) => loadFinanceAuditEvent(userId, eventId));
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

export async function setTargetSnoozeAction(
  month: string,
  categoryId: string,
  snoozed: boolean,
): Promise<ActionResult> {
  return run((userId) => setTargetSnooze(userId, { month, categoryId, snoozed }));
}

export async function createCategoryGroupAction(
  name: string,
  kind: EnvelopeKind,
  parentGroupId: string | null = null,
): Promise<DataActionResult<string>> {
  return runWithData((userId) =>
    createCategoryGroup(userId, { name, kind, parentGroupId }),
  );
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
  kind: EnvelopeKind = "spending",
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

export async function saveEnvelopeTargetAction(
  categoryId: string,
  target: unknown,
): Promise<ActionResult> {
  return run((userId) => saveEnvelopeTarget(userId, categoryId, target));
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
  return run((userId) => addPayeeAlias(userId, payeeId, alias));
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

/** The Files-here list for one envelope (`.../2026-08-25-2144-payee-evidence-and-merge/` D3). */
export async function payeeEvidenceAction(
  categoryId: string,
): Promise<QueryResult<PayeeEvidenceRow[]>> {
  return runQuery((userId) => payeeEvidenceForCategory(userId, categoryId));
}

/** Remove: release the payee's claim, or clear its default (D4). */
export async function clearPayeeRoutingAction(payeeId: string): Promise<ActionResult> {
  return run((userId) => clearPayeeRouting(userId, payeeId));
}

/** File a payee's waiting charges into an envelope, after the count was confirmed (D5). */
export async function fileWaitingChargesAction(
  payeeId: string,
  categoryId: string,
): Promise<DataActionResult<{ filed: number }>> {
  return runWithData((userId) =>
    fileWaitingChargesForPayee(userId, payeeId, categoryId),
  );
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

/* ────────────────────────────── Supplies worksheet ───────────────────────────── */

/**
 * The worksheet is a grid the client holds and patches, so the inline edits pass
 * `revalidate: []` — a layout revalidate reloads every row and discards the grid state the
 * user is mid-edit in, for the same reason `updateTransactionAction` does it.
 */
export async function listSupplyItemsAction(): Promise<QueryResult<SupplyItemRow[]>> {
  return runQuery(listSupplyItems);
}

export async function createSupplyItemAction(
  input: SupplyItemInput,
): Promise<ActionResult> {
  return run((userId) => createSupplyItem(userId, input), { revalidate: [] });
}

export async function updateSupplyItemAction(
  itemId: string,
  edit: SupplyItemEdit,
): Promise<ActionResult> {
  return run((userId) => updateSupplyItem(userId, itemId, edit), { revalidate: [] });
}

export async function deleteSupplyItemAction(itemId: string): Promise<ActionResult> {
  return run((userId) => deleteSupplyItem(userId, itemId), { revalidate: [] });
}

export async function createSupplyOptionAction(
  input: SupplyOptionInput,
): Promise<ActionResult> {
  return run((userId) => createSupplyOption(userId, input), { revalidate: [] });
}

export async function updateSupplyOptionAction(
  optionId: string,
  edit: SupplyOptionEdit,
): Promise<ActionResult> {
  return run((userId) => updateSupplyOption(userId, optionId, edit), {
    revalidate: [],
  });
}

export async function deleteSupplyOptionAction(
  optionId: string,
): Promise<ActionResult> {
  return run((userId) => deleteSupplyOption(userId, optionId), { revalidate: [] });
}

export async function setSupplyOptionInUseAction(
  optionId: string,
): Promise<ActionResult> {
  return run((userId) => setSupplyOptionInUse(userId, optionId), { revalidate: [] });
}

/** Repeat purchases shaped into prefills, minus whatever is already on the worksheet. */
export async function listAmazonSupplySuggestionsAction(): Promise<
  QueryResult<SupplySuggestion[]>
> {
  return runQuery(async (userId) => {
    const [purchases, items] = await Promise.all([
      listAmazonRepeatPurchases(userId),
      listSupplyItems(userId),
    ]);
    const knownAsins = new Set(
      items.flatMap((item) =>
        item.options.flatMap((option) => (option.asin ? [option.asin] : [])),
      ),
    );
    return supplySuggestions(purchases, { knownAsins });
  });
}

export async function createSupplyItemFromSuggestionAction(
  input: Parameters<typeof createSupplyItemFromSuggestion>[1],
): Promise<ActionResult> {
  // `run` reports the new item's id, which is what the dialog selects on return.
  return run((userId) => createSupplyItemFromSuggestion(userId, input), {
    revalidate: [],
  });
}

export async function previewSupplyMergeAction(
  targetId: string,
  sourceIds: readonly string[],
): Promise<QueryResult<SupplyMergePreview>> {
  return runQuery((userId) => previewSupplyMerge(userId, targetId, sourceIds));
}

export async function mergeSupplyItemsAction(
  targetId: string,
  sourceIds: readonly string[],
): Promise<DataActionResult<{ movedOptions: number }>> {
  return runWithData((userId) => mergeSupplyItems(userId, targetId, sourceIds), {
    revalidate: [],
  });
}

export async function addSupplyOptionFromAmazonAction(
  itemId: string,
  asin: string,
): Promise<ActionResult> {
  return run((userId) => addSupplyOptionFromAmazon(userId, itemId, asin), {
    revalidate: [],
  });
}

/**
 * Add one Amazon line item to the worksheet as a **new item**, from the Orders grid.
 *
 * Runs the same aggregate as the suggestion dialog, scoped to this ASIN, so the rate comes
 * from the whole purchase history rather than from the single row that was right-clicked.
 * One order gives no observable span, and rather than refuse — "I bought this once and want
 * to track it" is a reasonable thing to want — it falls back to a visible 30-days-per-unit
 * placeholder the user corrects in the grid.
 */
export async function addSupplyFromAmazonItemAction(
  asin: string,
): Promise<ActionResult> {
  return run((userId) => addSupplyItemFromAmazon(userId, asin), { revalidate: [] });
}

export async function loadAmazonIndexAction(
  query: unknown,
): Promise<QueryResult<AmazonOrdersPrepared>> {
  return runQuery((userId) => loadAmazonPrepared(userId, query));
}

export async function loadAmazonBlockAction(
  ids: readonly string[],
): Promise<QueryResult<AmazonOrdersRowBlock>> {
  const capped = ids.filter((id) => typeof id === "string").slice(0, AMAZON_BLOCK_SIZE);
  return runQuery((userId) => loadAmazonBlock(userId, capped));
}

export async function loadAmazonExportAction(
  query: unknown,
): Promise<QueryResult<AmazonItemListRow[]>> {
  return runQuery((userId) => loadAmazonExportRows(userId, query));
}

export async function previewAmazonSnapshotAction(
  text: string,
): Promise<DataActionResult<AmazonPreview>> {
  return runWithData((userId) => previewAmazonSnapshotText(userId, text), {
    revalidate: [],
  });
}

export async function applyAmazonSnapshotAction(
  text: string,
): Promise<DataActionResult<AmazonSnapshotApplyResult>> {
  return runWithData((userId) => applyAmazonSnapshotText(userId, text));
}

export async function listAmazonReviewItemsAction(): Promise<
  QueryResult<AmazonReviewRow[]>
> {
  return runQuery((userId) => listAmazonReviewItems(userId));
}

export async function listAmazonChargeCandidatesAction(
  chargeId: string,
): Promise<QueryResult<AmazonChargeCandidate[]>> {
  return runQuery((userId) => listAmazonChargeCandidates(userId, chargeId));
}

export async function approveAmazonChargeMatchAction(
  chargeId: string,
  transactionId: string,
): Promise<ActionResult> {
  return run((userId) => approveAmazonChargeMatch(userId, chargeId, transactionId));
}
