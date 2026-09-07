"use client";

import { useId, useState, useTransition } from "react";
import {
  setTransactionBudgetCategoryAction,
  splitTransactionAction,
  unsplitTransactionAction,
  updateSplitChildrenAction,
  updateTransactionAction,
} from "@/app/finances/actions";
import { DateText } from "@/components/date/DateText";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import { Section, SelectField, TextArea } from "@/components/detail/fields";
import { effectiveFlow } from "@/lib/finances/analytics";
import { categoryAssignmentRefusal } from "@/lib/finances/categoryEligibility";
import type { EnvelopeCatalog } from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind, FinanceFlowKind } from "@/db/schema";
import { CategorySelect } from "./CategorySelect";
import { SplitEditor } from "./SplitEditor";
import { FLOW_KINDS, flowLabel } from "@/lib/finances/flowLabels";
import { formatUsd } from "@/lib/finances/money";
import {
  planSplitCommit,
  splitDraftFromSaved,
  type SplitDraftChild,
} from "@/lib/finances/splitDraft";
import type { TransactionListRow } from "@/lib/finances/types";
import type { RegisterTransactionRow } from "@/lib/finances/registerQuery";

/**
 * Edit the user-owned half of a transaction.
 *
 * The bank's half — date, description, amount, its own category — is shown read-only. It is
 * the record as the bank wrote it, and the fingerprint that dedups re-imports is derived
 * from it, so an edit here would make the next import treat the row as a new transaction.
 *
 * Renders the row the Register already has. Fetching it again sat behind a layout
 * revalidation of every transaction, which is what made the drawer freeze on open.
 */
export function TransactionDrawer({
  transactionId,
  row,
  catalog,
  offBudgetAccountIds,
  onClose,
  onChanged,
  onCreateEnvelope,
  onSplitChanged,
  splitChildren,
}: {
  transactionId: string | null;
  row: RegisterTransactionRow | null;
  catalog: EnvelopeCatalog;
  offBudgetAccountIds: ReadonlySet<string>;
  onClose: () => void;
  onChanged: (id: string, patch: Partial<TransactionListRow>) => void;
  onCreateEnvelope: (transactionId: string, kind: EnvelopeKind) => void;
  onSplitChanged: () => void;
  splitChildren: readonly TransactionListRow[];
}) {
  const titleId = useId();
  if (!transactionId) return null;

  // The form owns the drawer once there is a record: every leave path has to run through
  // its dirty check, and the header × and the backdrop are leave paths.
  if (row) {
    return (
      <TransactionForm
        key={row.id}
        titleId={titleId}
        row={row}
        catalog={catalog}
        offBudgetAccountIds={offBudgetAccountIds}
        onClose={onClose}
        onChanged={onChanged}
        onCreateEnvelope={onCreateEnvelope}
        onSplitChanged={onSplitChanged}
        splitChildren={splitChildren}
      />
    );
  }

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Transaction"
        title="Could not open"
        onClose={onClose}
      />
      <p role="alert" className="px-5 py-4 text-[0.875rem] text-priority-a">
        That transaction no longer exists.
      </p>
    </Drawer>
  );
}

function ReadOnly({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className="text-[0.875rem] text-ink">{children}</span>
    </div>
  );
}

function TransactionForm({
  titleId,
  row,
  catalog,
  offBudgetAccountIds,
  onClose,
  onChanged,
  onCreateEnvelope,
  onSplitChanged,
  splitChildren,
}: {
  titleId: string;
  row: RegisterTransactionRow;
  catalog: EnvelopeCatalog;
  offBudgetAccountIds: ReadonlySet<string>;
  onClose: () => void;
  onChanged: (id: string, patch: Partial<TransactionListRow>) => void;
  onCreateEnvelope: (transactionId: string, kind: EnvelopeKind) => void;
  onSplitChanged: () => void;
  splitChildren: readonly TransactionListRow[];
}) {
  const [draft, setDraft] = useState(() => ({
    notes: row.notes,
    flowOverride: row.flowOverride,
  }));
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const [envelopeId, setEnvelopeId] = useState(row.budgetCategoryId);
  const [savingEnvelope, startEnvelopeTransition] = useTransition();
  const [learningNotice, setLearningNotice] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [splitDraft, setSplitDraft] = useState<readonly SplitDraftChild[] | null>(() =>
    splitChildren.length === 0 ? null : splitChildren.map(splitDraftFromSaved),
  );
  const [splitDirty, setSplitDirty] = useState(false);
  const [seenSplitChildren, setSeenSplitChildren] = useState(splitChildren);
  const envelopeRefusal = categoryAssignmentRefusal({
    accountOffBudget: offBudgetAccountIds.has(row.accountId),
    categoryAssignable: row.categoryAssignable,
  });

  // The Register loads the saved parts after the drawer opens, and reloads them after a
  // split is written. Reseeding in render rather than an effect: a fetch-on-mount effect is
  // the `set-state-in-effect` lint, and the parent already holds these rows.
  if (splitChildren !== seenSplitChildren) {
    setSeenSplitChildren(splitChildren);
    setSplitDraft(
      splitChildren.length === 0 ? null : splitChildren.map(splitDraftFromSaved),
    );
    setSplitDirty(false);
  }

  type Draft = typeof draft;
  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function patchSplit(next: readonly SplitDraftChild[] | null, edited = true) {
    setError(null);
    setSplitDraft(next);
    if (edited) {
      setJustSaved(false);
      setSplitDirty(true);
    }
  }

  function requestClose() {
    if (dirty || splitDirty) setConfirmClose(true);
    else onClose();
  }

  function save(thenClose: boolean) {
    setError(null);
    const commit = planSplitCommit({
      alreadySplit: row.splitChildCount > 0,
      dirty: splitDirty,
      drafts: splitDraft,
    });
    startTransition(async () => {
      if (dirty) {
        const result = await updateTransactionAction(row.id, {
          notes: draft.notes,
          flowOverride: draft.flowOverride,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDirty(false);
        onChanged(row.id, {
          notes: draft.notes,
          flowOverride: draft.flowOverride,
        });
      }
      if (commit.kind !== "none") {
        // An unbalanced split is refused by the mutation, which owns that rule; the message
        // it returns names the gap and points at Distribute. Staying open with it beats a
        // second copy of the arithmetic here that could disagree.
        const result =
          commit.kind === "create"
            ? await splitTransactionAction(row.id, commit.children)
            : commit.kind === "update"
              ? await updateSplitChildrenAction(row.id, commit.children)
              : await unsplitTransactionAction(row.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSplitDirty(false);
        onSplitChanged();
      }
      if (thenClose) onClose();
      else setJustSaved(true);
    });
  }

  function setEnvelope(categoryId: string | null) {
    const previous = envelopeId;
    setEnvelopeId(categoryId);
    setError(null);
    startEnvelopeTransition(async () => {
      const result = await setTransactionBudgetCategoryAction(row.id, categoryId);
      if (!result.ok) {
        setEnvelopeId(previous);
        setError(result.error ?? "Could not set the envelope.");
        return;
      }
      setLearningNotice(result.id ?? null);
      onChanged(row.id, {
        budgetCategoryId: categoryId,
        budgetCategoryName: categoryId
          ? (catalog.envelopes.find((envelope) => envelope.id === categoryId)?.name ??
            null)
          : null,
      });
    });
  }

  return (
    <>
      <Drawer open onClose={requestClose} labelledBy={titleId}>
        <DrawerHeader
          titleId={titleId}
          eyebrow="Transaction"
          title={row.description}
          onClose={requestClose}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-6">
            <Section title="Your notes">
              <TextArea
                label="Notes"
                rows={4}
                value={draft.notes}
                onChange={(value) => patch("notes", value)}
              />
              {catalog.envelopes.length > 0 &&
                row.splitChildCount === 0 &&
                (envelopeRefusal ? (
                  <ReadOnly label="Category">
                    <span className="text-ink-muted">Not budgeted</span>
                    <span className="mt-1 block text-[0.75rem] text-ink-faint">
                      {envelopeRefusal}
                    </span>
                  </ReadOnly>
                ) : (
                  <label className="flex flex-col gap-1">
                    <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                      Category
                    </span>
                    <CategorySelect
                      catalog={catalog}
                      value={envelopeId}
                      onChange={setEnvelope}
                      onCreate={(kind) => onCreateEnvelope(row.id, kind)}
                      disabled={savingEnvelope}
                      ariaLabel="Category"
                      className="min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:py-1 md:text-[0.8125rem]"
                    />
                    <span className="text-[0.75rem] text-ink-faint">
                      Saved immediately. Repeated choices for the same payee can teach
                      its default Category.
                    </span>
                  </label>
                ))}
              {learningNotice ? (
                <p className="text-[0.75rem] text-select-edge">{learningNotice}</p>
              ) : null}
            </Section>

            {row.parentId === null && catalog.envelopes.length > 0 ? (
              <Section title="Split">
                <SplitEditor
                  row={row}
                  drafts={splitDraft}
                  alreadySplit={row.splitChildCount > 0}
                  catalog={catalog}
                  onCreateEnvelope={onCreateEnvelope}
                  onChange={patchSplit}
                />
              </Section>
            ) : null}

            <Section title="Classification">
              <SelectField<FinanceFlowKind>
                label="Flow"
                value={draft.flowOverride}
                options={FLOW_KINDS.map((kind) => ({
                  value: kind,
                  label: flowLabel(kind),
                }))}
                onChange={(value) => patch("flowOverride", value)}
                allowEmpty
                emptyLabel={`Classifier: ${flowLabel(effectiveFlow({ ...row, flowOverride: null }))}`}
                hint="Only set this where the classifier is wrong. Your choice wins over every future reclassify."
              />
            </Section>

            <Section title="From the bank">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <ReadOnly label="Account">{row.accountName}</ReadOnly>
                <ReadOnly label="Amount">
                  <span
                    className={`tabular font-medium ${
                      row.amountCents < 0 ? "text-priority-a" : "text-ink"
                    }`}
                  >
                    {formatUsd(row.amountCents)}
                  </span>
                </ReadOnly>
                <ReadOnly label="Date">
                  <DateText dateKey={row.transactionDate} className="tabular" />
                </ReadOnly>
                <ReadOnly label="Posted">
                  {row.postedDate ? (
                    <DateText dateKey={row.postedDate} className="tabular" />
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </ReadOnly>
                <ReadOnly label="Description">{row.description}</ReadOnly>
                <ReadOnly label="Bank category">
                  {row.sourceCategory || <span className="text-ink-faint">—</span>}
                </ReadOnly>
                {row.balanceAfterCents !== null && (
                  <ReadOnly label="Balance after">
                    <span className="tabular">{formatUsd(row.balanceAfterCents)}</span>
                  </ReadOnly>
                )}
              </div>
              <p className="mt-3 text-[0.8125rem] text-ink-faint">
                These are the bank&rsquo;s record and are not editable. Re-imports are
                matched on them, so changing one would make this transaction import
                again as a duplicate.
              </p>
            </Section>
          </div>
        </div>

        <DrawerFooter
          onSave={() => save(false)}
          onSaveAndClose={() => save(true)}
          onClose={requestClose}
          saving={saving || savingEnvelope}
          dirty={dirty || splitDirty}
          justSaved={justSaved}
          error={error}
        />
      </Drawer>

      <ConfirmDialog
        open={confirmClose}
        title="Discard changes?"
        message="You have unsaved transaction changes. Close without saving?"
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmClose(false);
          setDirty(false);
          setSplitDirty(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}
