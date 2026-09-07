"use client";

import type { EnvelopeCatalog } from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";
import {
  centsToNumericString,
  formatUsd,
  parseAmountCents,
} from "@/lib/finances/money";
import { emptySplitDraft, type SplitDraftChild } from "@/lib/finances/splitDraft";
import {
  assignRemainderTo,
  defaultStrategy,
  distributeRemainder,
  splitRemainderCents,
} from "@/lib/finances/splitRemainder";
import type { RegisterTransactionRow } from "@/lib/finances/registerQuery";
import { CategorySelect } from "./CategorySelect";

/**
 * Divide one charge between envelopes, in the drawer.
 *
 * The mutation refuses to write a split that does not add up
 * (`agent-os/specs/2026-08-26-2022-split-transactions/` D6), which is only a liveable rule
 * because Distribute closes the gap in one click — and closes it *proportionally*, since the
 * gap is nearly always sales tax on the lines you just typed off a receipt.
 *
 * **The draft is the drawer's, not this component's.** This is a section of an explicit-save
 * form, so it has no save button of its own: the footer's Save and Save & Close write it,
 * Cancel discards it, and the parts count towards "Unsaved changes" like every other field.
 * Owning the draft here is what let Save & Close close over a filled-in split and lose it.
 *
 * Desktop only (D12). Splitting is a deliberate, fiddly operation done while reading a
 * receipt; the phone shows the parts and no editor.
 */
export function SplitEditor({
  row,
  drafts,
  alreadySplit,
  catalog,
  onCreateEnvelope,
  onChange,
}: {
  row: RegisterTransactionRow;
  /** Null while the editor is closed — a row with no split and no drafted parts. */
  drafts: readonly SplitDraftChild[] | null;
  /** Whether the saved row is split, which is what "remove every part" means against. */
  alreadySplit: boolean;
  catalog: EnvelopeCatalog;
  onCreateEnvelope: (transactionId: string, kind: EnvelopeKind) => void;
  /** `null` closes the editor; `edited` is false for changes that are not the user's edits. */
  onChange: (next: readonly SplitDraftChild[] | null, edited?: boolean) => void;
}) {
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

  if (drafts === null) {
    return (
      <button
        type="button"
        className="min-h-tap self-start rounded border border-rule px-3 text-[0.8125rem] text-ink md:min-h-0 md:py-1"
        // Disclosing the empty editor is not yet an edit: it must not dirty the form.
        onClick={() =>
          onChange(
            [
              emptySplitDraft(crypto.randomUUID()),
              emptySplitDraft(crypto.randomUUID()),
            ],
            false,
          )
        }
      >
        Split this transaction
      </button>
    );
  }

  const amounts = drafts.map((child) => child.amountCents);
  const remainder = splitRemainderCents(row.amountCents, amounts);
  const removingSplit = alreadySplit && drafts.length === 0;

  function update(key: string, patch: Partial<SplitDraftChild>) {
    onChange(
      (drafts ?? []).map((child) =>
        child.key === key ? { ...child, ...patch } : child,
      ),
    );
  }

  function applyAmounts(next: readonly number[]) {
    onChange(
      (drafts ?? []).map((child, i) => ({
        ...child,
        amountCents: next[i],
        amountText: centsToNumericString(next[i]),
      })),
    );
  }

  function remove(key: string) {
    const kept = (drafts ?? []).filter((entry) => entry.key !== key);
    // Removing the last part of a row that is not split abandons the split entirely, rather
    // than leaving an empty editor whose Save has nothing to write.
    onChange(kept.length === 0 && !alreadySplit ? null : kept);
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
              onClick={() => remove(child.key)}
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
          onClick={() => onChange([...drafts, emptySplitDraft(crypto.randomUUID())])}
        >
          Add a part
        </button>
        {alreadySplit && drafts.length > 0 ? (
          <button
            type="button"
            className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink-muted hover:text-priority-a"
            title="Drop every part and put the whole amount back on one row. Saved with the drawer."
            onClick={() => onChange([])}
          >
            Unsplit
          </button>
        ) : null}
        <span
          className={`tabular text-[0.8125rem] ${
            removingSplit || remainder !== 0 ? "text-priority-a" : "text-ink-muted"
          }`}
        >
          {removingSplit
            ? "Saving will remove the split."
            : remainder === 0
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

      <p className="text-[0.75rem] text-ink-faint">
        The parts are saved with the drawer — use Save or Save &amp; Close below.
      </p>
    </div>
  );
}
