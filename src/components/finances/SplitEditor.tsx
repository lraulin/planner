"use client";

import { useState, useTransition } from "react";
import {
  splitTransactionAction,
  unsplitTransactionAction,
  updateSplitChildrenAction,
} from "@/app/finances/actions";
import type { EnvelopeCatalog } from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";
import {
  centsToNumericString,
  formatUsd,
  parseAmountCents,
} from "@/lib/finances/money";
import {
  assignRemainderTo,
  defaultStrategy,
  distributeRemainder,
  splitRemainderCents,
} from "@/lib/finances/splitRemainder";
import type { RegisterTransactionRow } from "@/lib/finances/registerQuery";
import type { TransactionListRow } from "@/lib/finances/types";
import { CategorySelect } from "./CategorySelect";

/**
 * Divide one charge between envelopes, in the drawer.
 *
 * The mutation refuses to write a split that does not add up
 * (`agent-os/specs/2026-08-26-2022-split-transactions/` D6), which is only a liveable rule
 * because Distribute closes the gap in one click — and closes it *proportionally*, since the
 * gap is nearly always sales tax on the lines you just typed off a receipt.
 *
 * Desktop only (D12). Splitting is a deliberate, fiddly operation done while reading a
 * receipt; the phone shows the parts and no editor.
 */
type ChildDraft = {
  /** Stable across re-renders so an amount field does not lose focus; not the row id. */
  key: string;
  id?: string;
  amountCents: number;
  amountText: string;
  budgetCategoryId: string | null;
  notes: string;
};

function draftFrom(row: {
  id: string;
  amountCents: number;
  budgetCategoryId: string | null;
  notes: string;
}): ChildDraft {
  return {
    key: row.id,
    id: row.id,
    amountCents: row.amountCents,
    amountText: centsToNumericString(row.amountCents),
    budgetCategoryId: row.budgetCategoryId,
    notes: row.notes,
  };
}

function emptyDraft(): ChildDraft {
  return {
    key: crypto.randomUUID(),
    amountCents: 0,
    amountText: "",
    budgetCategoryId: null,
    notes: "",
  };
}

export function SplitEditor({
  row,
  existing,
  catalog,
  onCreateEnvelope,
  onSplitChanged,
}: {
  row: RegisterTransactionRow;
  /** The saved children, loaded by the Register — the parent is the source of truth. */
  existing: readonly TransactionListRow[];
  catalog: EnvelopeCatalog;
  onCreateEnvelope: (transactionId: string, kind: EnvelopeKind) => void;
  onSplitChanged: () => void;
}) {
  const [children, setChildren] = useState<ChildDraft[] | null>(null);
  const [seenExisting, setSeenExisting] = useState(existing);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const split = row.splitChildCount > 0;

  // Reset the draft when the saved children arrive or change underneath, in render rather
  // than an effect: a fetch-on-mount effect is the `set-state-in-effect` lint, and the
  // parent already holds these rows.
  if (existing !== seenExisting) {
    setSeenExisting(existing);
    setChildren(existing.length === 0 ? null : existing.map(draftFrom));
  }
  if (split && children === null && existing.length > 0) {
    setChildren(existing.map(draftFrom));
  }

  // Splitting a transfer leg is refused by the mutation (D10); saying so before the click is
  // better than an error after it.
  if (row.transferGroupId) {
    return (
      <p className="text-[0.8125rem] text-ink-faint">
        A transfer cannot be split — both legs would have to be divided to stay
        coherent.
      </p>
    );
  }

  if (!split && children === null) {
    return (
      <button
        type="button"
        className="min-h-tap self-start rounded border border-rule px-3 text-[0.8125rem] text-ink md:min-h-0 md:py-1"
        onClick={() => setChildren([emptyDraft(), emptyDraft()])}
      >
        Split this transaction
      </button>
    );
  }

  const drafts = children ?? [];
  const amounts = drafts.map((child) => child.amountCents);
  const remainder = splitRemainderCents(row.amountCents, amounts);

  function update(key: string, patch: Partial<ChildDraft>) {
    setError(null);
    setChildren((current) =>
      (current ?? []).map((child) =>
        child.key === key ? { ...child, ...patch } : child,
      ),
    );
  }

  function applyAmounts(next: readonly number[]) {
    setError(null);
    setChildren((current) =>
      (current ?? []).map((child, i) => ({
        ...child,
        amountCents: next[i],
        amountText: centsToNumericString(next[i]),
      })),
    );
  }

  function save() {
    setError(null);
    const payload = drafts.map((child) => ({
      id: child.id,
      amountCents: child.amountCents,
      budgetCategoryId: child.budgetCategoryId,
      notes: child.notes,
    }));
    startTransition(async () => {
      const result = split
        ? await updateSplitChildrenAction(row.id, payload)
        : await splitTransactionAction(row.id, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSplitChanged();
    });
  }

  function unsplit() {
    setError(null);
    startTransition(async () => {
      const result = await unsplitTransactionAction(row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChildren(null);
      onSplitChanged();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.8125rem] text-ink-faint md:hidden">
        Splitting is a desktop job. The parts are listed below, read-only.
      </p>
      <div className="flex flex-col gap-2">
        {drafts.map((child, index) => (
          <div key={child.key} className="flex flex-wrap items-center gap-2">
            <input
              value={child.amountText}
              aria-label={`Amount for part ${index + 1}`}
              inputMode="decimal"
              // Commit on blur, not per keystroke: a half-typed "-1" is not an amount, and
              // recomputing the remainder from one would flash a wrong number at every digit.
              onChange={(event) =>
                update(child.key, { amountText: event.target.value })
              }
              onBlur={() =>
                update(child.key, {
                  amountCents: parseAmountCents(child.amountText) ?? 0,
                  amountText: centsToNumericString(
                    parseAmountCents(child.amountText) ?? 0,
                  ),
                })
              }
              className="tabular w-24 rounded border border-rule bg-surface px-2 py-1 text-right text-[0.8125rem] text-ink"
            />
            <CategorySelect
              catalog={catalog}
              value={child.budgetCategoryId}
              ariaLabel={`Category for part ${index + 1}`}
              onChange={(categoryId) =>
                update(child.key, { budgetCategoryId: categoryId })
              }
              onCreate={(kind) => onCreateEnvelope(row.id, kind)}
              className="min-w-0 flex-1 rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink"
            />
            <input
              value={child.notes}
              aria-label={`Note for part ${index + 1}`}
              placeholder="What this part was"
              onChange={(event) => update(child.key, { notes: event.target.value })}
              className="min-w-0 flex-1 rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink"
            />
            {remainder === 0 ? null : (
              <button
                type="button"
                title="Give this part the whole remainder"
                aria-label={`Give part ${index + 1} the remaining ${formatUsd(remainder)}`}
                className="rounded border border-rule px-2 py-1 text-[0.75rem] text-ink-muted hover:text-ink"
                onClick={() =>
                  applyAmounts(assignRemainderTo(row.amountCents, amounts, index))
                }
              >
                Take
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove part ${index + 1}`}
              className="rounded border border-rule px-2 py-1 text-[0.75rem] text-ink-muted hover:text-priority-a"
              onClick={() =>
                setChildren((current) =>
                  (current ?? []).filter((entry) => entry.key !== child.key),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink"
          onClick={() => setChildren([...drafts, emptyDraft()])}
        >
          Add a part
        </button>
        <span
          className={`tabular text-[0.8125rem] ${remainder === 0 ? "text-ink-muted" : "text-priority-a"}`}
        >
          {remainder === 0
            ? `Balanced at ${formatUsd(row.amountCents)}`
            : `${formatUsd(remainder)} left to allocate`}
        </span>
        {remainder === 0 || drafts.length === 0 ? null : (
          <button
            type="button"
            className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink"
            title={
              defaultStrategy(amounts) === "proportional"
                ? "Spread it across the parts in proportion to their amounts — how tax behaves."
                : "Spread it evenly across the parts that have no amount yet."
            }
            onClick={() => applyAmounts(distributeRemainder(row.amountCents, amounts))}
          >
            Distribute
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || remainder !== 0 || drafts.length === 0}
          className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
          onClick={save}
        >
          {split ? "Save the split" : "Split it"}
        </button>
        {split ? (
          <button
            type="button"
            disabled={saving}
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink-muted hover:text-priority-a disabled:opacity-50 md:min-h-0 md:py-1"
            onClick={unsplit}
          >
            Unsplit
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            className="min-h-tap rounded px-3 text-[0.8125rem] text-ink-muted md:min-h-0 md:py-1"
            onClick={() => setChildren(null)}
          >
            Cancel
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-[0.8125rem] text-priority-a">
          {error}
        </p>
      ) : null}
    </div>
  );
}
