"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { getTransactionAction, updateTransactionAction } from "@/app/finances/actions";
import { DateText } from "@/components/date/DateText";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import { Section, TextArea, TextField } from "@/components/detail/fields";
import { formatUsd } from "@/lib/finances/money";
import type { TransactionListRow } from "@/lib/finances/types";

/**
 * Edit the user-owned half of a transaction.
 *
 * The bank's half — date, description, amount, its own category — is shown read-only. It is
 * the record as the bank wrote it, and the fingerprint that dedups re-imports is derived
 * from it, so an edit here would make the next import treat the row as a new transaction.
 */
export function TransactionDrawer({
  transactionId,
  onClose,
  onChanged,
}: {
  transactionId: string | null;
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
  onClose,
  onChanged,
}: {
  row: TransactionListRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(() => ({
    category: row.category ?? "",
    notes: row.notes,
  }));
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  function patch(key: "category" | "notes", value: string) {
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

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-6">
          <Section title="Your notes">
            <TextField
              label="Category"
              value={draft.category}
              onChange={(value) => patch("category", value)}
              placeholder="Groceries, Utilities, …"
              hint="Yours to set. Re-importing this file will never overwrite it."
            />
            <TextArea
              label="Notes"
              rows={4}
              value={draft.notes}
              onChange={(value) => patch("notes", value)}
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
        saving={saving}
        dirty={dirty}
        justSaved={justSaved}
        error={error}
      />
    </>
  );
}
