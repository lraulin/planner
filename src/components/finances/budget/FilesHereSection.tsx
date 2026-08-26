"use client";

import {
  evidenceStatusCopy,
  type PayeeEvidenceRow,
} from "@/lib/finances/payees/evidence";

/**
 * What files into this envelope, and whether the app has learned it yet.
 *
 * The consequence of a payee default is visible at the *envelope* — this is the charge that
 * landed here — so this is where the evidence belongs. Every count is a fact from the ledger
 * and every state is the guard's own answer; nothing here is recomputed
 * (`agent-os/specs/2026-08-25-2144-payee-evidence-and-merge/` D3).
 *
 * Scan-first: filed, waiting and applied-vs-held all read without a click, and the two
 * actions that fix a wrong row — Remove and Merge — act from the list itself (D4).
 */
export function FilesHereSection({
  envelopeName,
  rows,
  selected,
  pending,
  onToggle,
  onMerge,
  onRemove,
  onFileWaiting,
}: {
  envelopeName: string;
  /** `null` while the list is still loading — an empty array is a real answer. */
  rows: readonly PayeeEvidenceRow[] | null;
  selected: readonly string[];
  pending: boolean;
  onToggle: (payeeId: string) => void;
  onMerge: () => void;
  onRemove: (row: PayeeEvidenceRow) => void;
  onFileWaiting: (row: PayeeEvidenceRow) => void;
}) {
  return (
    <section className="rounded border border-rule bg-surface px-3 py-2">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[0.75rem] font-medium text-ink-muted">Files here</h3>
        <span className="text-[0.6875rem] text-ink-faint">filed · waiting</span>
      </div>

      {rows === null ? (
        <p className="text-[0.8125rem] text-ink-muted">Reading the ledger…</p>
      ) : rows.length === 0 ? (
        <p className="text-[0.8125rem] text-ink-muted">
          Nothing files into {envelopeName} yet. Categorize a charge in the Register and
          its payee appears here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {rows.map((row) => (
            <EvidenceLine
              key={row.payeeId}
              row={row}
              envelopeName={envelopeName}
              checked={selected.includes(row.payeeId)}
              pending={pending}
              onToggle={() => onToggle(row.payeeId)}
              onRemove={() => onRemove(row)}
              onFileWaiting={() => onFileWaiting(row)}
            />
          ))}
        </ul>
      )}

      {rows && rows.length > 1 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || selected.length < 2}
            onClick={onMerge}
            className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-40 md:min-h-0"
          >
            Merge…
          </button>
          <span className="text-[0.6875rem] text-ink-faint">
            {selected.length < 2
              ? "Tick two or more spellings of one payee."
              : `${selected.length} selected.`}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function EvidenceLine({
  row,
  envelopeName,
  checked,
  pending,
  onToggle,
  onRemove,
  onFileWaiting,
}: {
  row: PayeeEvidenceRow;
  envelopeName: string;
  checked: boolean;
  pending: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onFileWaiting: () => void;
}) {
  const removable = row.status.kind === "claimed" || row.status.kind === "applied";

  return (
    <li className="flex flex-col gap-1 py-1.5">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          aria-label={`Select ${row.name} to merge`}
          onChange={onToggle}
          className="mt-1 size-4 shrink-0 accent-[var(--select-edge)]"
        />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
          {row.name}
        </span>
        <span className="tabular shrink-0 text-[0.8125rem] text-ink-muted">
          {row.filedCount.toLocaleString()} ·{" "}
          {row.unfiledCount === 0 ? "—" : row.unfiledCount.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[0.6875rem]">
        <span className="text-ink-muted">{evidenceStatusCopy(row)}</span>
        {row.routedTo ? (
          <span className="text-[var(--goal-unmet)]">
            ⚠ files to {row.routedTo.name}, not {envelopeName}
          </span>
        ) : null}
        {row.damagedName ? (
          <span className="text-[var(--goal-unmet)]">⚠ damaged name</span>
        ) : null}
      </div>

      {removable || row.unfiledCount > 0 ? (
        <div className="flex flex-wrap gap-2 pl-6">
          {row.unfiledCount > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={onFileWaiting}
              className="min-h-tap rounded border border-rule px-2 py-1 text-[0.75rem] text-ink hover:bg-surface-raised disabled:opacity-50 md:min-h-0"
            >
              File {row.unfiledCount.toLocaleString()} waiting…
            </button>
          ) : null}
          {removable ? (
            <button
              type="button"
              disabled={pending}
              onClick={onRemove}
              className="min-h-tap rounded border border-rule px-2 py-1 text-[0.75rem] text-ink-muted hover:bg-surface-raised disabled:opacity-50 md:min-h-0"
            >
              {row.status.kind === "claimed" ? "Release claim" : "Remove default"}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
