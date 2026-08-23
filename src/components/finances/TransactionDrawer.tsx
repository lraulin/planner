"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  getTransactionAction,
  setTransactionBudgetCategoryAction,
  updateTransactionAction,
} from "@/app/finances/actions";
import { DateText } from "@/components/date/DateText";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import {
  CheckboxField,
  Section,
  SelectField,
  TextArea,
  TextField,
} from "@/components/detail/fields";
import { effectiveCategory, effectiveFlow } from "@/lib/finances/analytics";
import { SAVINGS_KINDS } from "@/lib/finances/available";
import { envelopeAssignmentRefusal } from "@/lib/finances/budget/autoMap";
import { FLOW_KINDS, flowLabel } from "@/lib/finances/flowLabels";
import { formatUsd } from "@/lib/finances/money";
import type { TransactionListRow } from "@/lib/finances/types";
import type { FinanceFlowKind } from "@/db/schema";

/**
 * Edit the user-owned half of a transaction.
 *
 * The bank's half — date, description, amount, its own category — is shown read-only. It is
 * the record as the bank wrote it, and the fingerprint that dedups re-imports is derived
 * from it, so an edit here would make the next import treat the row as a new transaction.
 */
export function TransactionDrawer({
  transactionId,
  envelopes,
  budgetStartMonth,
  offBudgetAccountIds,
  onClose,
  onChanged,
}: {
  transactionId: string | null;
  envelopes: readonly { id: string; label: string }[];
  budgetStartMonth: string | null;
  offBudgetAccountIds: ReadonlySet<string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleId = useId();
  const [loaded, setLoaded] = useState<{
    transactionId: string;
    row: TransactionListRow | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    let current = true;
    void getTransactionAction(transactionId).then(
      (result) => {
        if (!current) return;
        if (!result.ok) setLoaded({ transactionId, row: null, error: result.error });
        else if (!result.data) {
          setLoaded({
            transactionId,
            row: null,
            error: "That transaction no longer exists.",
          });
        } else {
          setLoaded({ transactionId, row: result.data, error: null });
        }
      },
      () => {
        if (current) {
          setLoaded({
            transactionId,
            row: null,
            error: "Could not load this transaction.",
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [transactionId]);

  if (!transactionId) return null;
  const current = loaded?.transactionId === transactionId ? loaded : null;

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Transaction"
        title={
          current?.row?.description ?? (current?.error ? "Could not open" : "Loading…")
        }
        onClose={onClose}
      />
      {current?.error ? (
        <p role="alert" className="px-5 py-4 text-[0.875rem] text-priority-a">
          {current.error}
        </p>
      ) : current?.row ? (
        <TransactionForm
          key={current.row.id}
          row={current.row}
          envelopes={envelopes}
          budgetStartMonth={budgetStartMonth}
          offBudgetAccountIds={offBudgetAccountIds}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
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
  row,
  envelopes,
  budgetStartMonth,
  offBudgetAccountIds,
  onClose,
  onChanged,
}: {
  row: TransactionListRow;
  envelopes: readonly { id: string; label: string }[];
  budgetStartMonth: string | null;
  offBudgetAccountIds: ReadonlySet<string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    category: row.category ?? "",
    notes: row.notes,
    flowOverride: row.flowOverride,
    excludeFromBaseline: row.excludeFromBaseline,
    eventLabel: row.eventLabel,
    plannedWithdrawal: row.plannedWithdrawal,
  }));
  // Money leaving a savings account: the only row where "was this planned?" is a real
  // question. `SAVINGS_KINDS` rather than a literal so this and the arithmetic cannot drift
  // apart about what a reserve account is.
  const isSavingsWithdrawal = SAVINGS_KINDS.has(row.accountKind) && row.amountCents < 0;
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const [envelopeId, setEnvelopeId] = useState(row.budgetCategoryId);
  const [savingEnvelope, startEnvelopeTransition] = useTransition();
  const envelopeRefusal = envelopeAssignmentRefusal({
    transactionDate: row.transactionDate,
    budgetStartMonth,
    accountOffBudget: offBudgetAccountIds.has(row.accountId),
  });

  type Draft = typeof draft;
  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save(thenClose: boolean) {
    setError(null);
    startTransition(async () => {
      if (dirty) {
        const result = await updateTransactionAction(row.id, {
          // Blank means uncategorised, which the mutation stores as null.
          category: draft.category,
          notes: draft.notes,
          flowOverride: draft.flowOverride,
          excludeFromBaseline: draft.excludeFromBaseline,
          // Clearing either flag clears the name with it, the same rule `setOneOff` follows.
          // The two share one label column, so the name survives while *either* holds it.
          eventLabel:
            draft.excludeFromBaseline || draft.plannedWithdrawal
              ? draft.eventLabel
              : "",
          plannedWithdrawal: draft.plannedWithdrawal,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDirty(false);
        onChanged();
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
      onChanged();
    });
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-6">
          <Section title="Your notes">
            <TextField
              label="Category"
              value={draft.category}
              onChange={(value) => patch("category", value)}
              placeholder={effectiveCategory(row)}
              hint={
                row.derivedCategory
                  ? `Blank uses the classifier's answer, ${row.derivedCategory}. Anything you type wins and survives a reclassify.`
                  : "Yours to set. Re-importing this file will never overwrite it."
              }
            />
            <TextArea
              label="Notes"
              rows={4}
              value={draft.notes}
              onChange={(value) => patch("notes", value)}
            />
            {envelopes.length > 0 &&
              (envelopeRefusal ? (
                <ReadOnly label="Envelope">
                  <span className="text-ink-muted">Not budgeted</span>
                  <span className="mt-1 block text-[0.75rem] text-ink-faint">
                    {envelopeRefusal}
                  </span>
                </ReadOnly>
              ) : (
                <SelectField<string>
                  label="Envelope"
                  value={envelopeId}
                  options={envelopes.map(({ id, label }) => ({ value: id, label }))}
                  onChange={setEnvelope}
                  allowEmpty
                  emptyLabel="Unassigned"
                  disabled={savingEnvelope}
                  hint="Saved immediately. Category describes the purchase; Envelope decides which pool of money pays. A direct choice is never overwritten by automatic sorting."
                />
              ))}
          </Section>

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
            <CheckboxField
              label="One-off — keep out of the baseline"
              checked={draft.excludeFromBaseline}
              onChange={(checked) => patch("excludeFromBaseline", checked)}
              hint="For real money that says nothing about what next month costs. An annual premium is not one of these."
            />
            {(draft.excludeFromBaseline || draft.plannedWithdrawal) && (
              <TextField
                label="Event"
                value={draft.eventLabel}
                onChange={(value) => patch("eventLabel", value)}
                placeholder={
                  draft.plannedWithdrawal
                    ? "Handgun, New laptop"
                    : "Wedding, House move"
                }
                hint={
                  draft.plannedWithdrawal
                    ? "Names what the money was saved for, so the dashboard can say why this draw was fine."
                    : "Names the event so its charges total together on the dashboard."
                }
              />
            )}
          </Section>

          {/* Only offered where it can mean anything. On a card charge or a deposit the
              checkbox would be a question with no answer, and a flag that can be set on
              rows it does not describe is a flag nobody can trust on the rows it does. */}
          {isSavingsWithdrawal && (
            <Section title="Savings">
              <CheckboxField
                label="Planned — this is what the money was saved for"
                checked={draft.plannedWithdrawal}
                onChange={(checked) => patch("plannedWithdrawal", checked)}
                hint="Keeps the pay period it falls in counted as covering itself. Leave off for a draw that covered an overspend — that is the one this dashboard is meant to catch."
              />
            </Section>
          )}

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
              matched on them, so changing one would make this transaction import again
              as a duplicate.
            </p>
          </Section>
        </div>
      </div>

      <DrawerFooter
        onSave={() => save(false)}
        onSaveAndClose={() => save(true)}
        onClose={onClose}
        saving={saving || savingEnvelope}
        dirty={dirty}
        justSaved={justSaved}
        error={error}
      />
    </>
  );
}
