"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { mergePayeesAction, previewPayeeMergeAction } from "@/app/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import { formatUsd } from "@/lib/finances/money";
import type { PayeeMergePreview } from "@/lib/finances/payees/queries";

function claimLabel(preview: PayeeMergePreview): string {
  if (!preview.resultingClaim) return "No envelope claim";
  return `Envelope: ${preview.resultingClaim.name}`;
}

/**
 * Choose the surviving payee and inspect every reference the merge will move.
 *
 * Takes only the identities: the Payees grid selects whole rows, while the Budget inspector's
 * Files-here list selects evidence rows for the same payees
 * (`agent-os/specs/2026-08-25-2144-payee-evidence-and-merge/` D4). Everything else the dialog
 * shows comes from the server preview, which is the only trustworthy source for it anyway.
 */
export function PayeeMergeDialog({
  payees,
  onClose,
  onMerged,
}: {
  payees: readonly { id: string; name: string }[];
  onClose: () => void;
  onMerged: (message: string) => void;
}) {
  const titleId = useId();
  const selectedIds = useMemo(() => payees.map((payee) => payee.id), [payees]);
  const [targetId, setTargetId] = useState(selectedIds[0] ?? "");
  const [preview, setPreview] = useState<PayeeMergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [merging, startMerging] = useTransition();

  useEffect(() => {
    if (!targetId || selectedIds.length < 2) return;
    let cancelled = false;
    startLoading(async () => {
      const result = await previewPayeeMergeAction(
        targetId,
        selectedIds.filter((id) => id !== targetId),
      );
      if (cancelled) return;
      if (result.ok) setPreview(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedIds, targetId]);

  function merge() {
    if (!preview || preview.refusal) return;
    setError(null);
    startMerging(async () => {
      const result = await mergePayeesAction(
        targetId,
        selectedIds.filter((id) => id !== targetId),
      );
      if (!result.ok || !result.data) {
        setError(result.ok ? "The merge did not return a result." : result.error);
        return;
      }
      onMerged(
        `${result.data.movedAliases} spellings and ${result.data.movedTransactions} charges merged into ${preview.target.name}.`,
      );
    });
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      labelledBy={titleId}
      role="alertdialog"
      width="max-w-xl"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Merge selected payees
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          Keep one identity and move the others into it. The source payee records are
          deleted after every reference moves.
        </p>

        <label className="mt-5 flex flex-col gap-1 text-[0.75rem] font-medium text-ink-muted">
          Payee to keep
          <select
            value={targetId}
            disabled={merging}
            onChange={(event) => {
              setPreview(null);
              setError(null);
              setTargetId(event.target.value);
            }}
            className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
          >
            {payees.map((payee) => (
              <option key={payee.id} value={payee.id}>
                {payee.name}
              </option>
            ))}
          </select>
        </label>

        {loading && (
          <p className="mt-5 text-[0.8125rem] text-ink-muted">Checking references…</p>
        )}

        {preview && (
          <div className="mt-5 space-y-4">
            <div className="rounded border border-rule bg-surface-raised/40 p-3">
              <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                Merging into {preview.target.name}
              </p>
              <p className="mt-1 text-[0.8125rem] text-ink">
                {preview.sources.map((source) => source.name).join(", ")}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-[0.8125rem] sm:grid-cols-4">
              <div>
                <dt className="text-ink-muted">Spellings</dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {preview.movedAliases.length}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Charges</dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {preview.movedTransactions.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Register total</dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {formatUsd(preview.movedTotalCents)}
                </dd>
              </div>
            </dl>

            {preview.movedAliases.length > 0 && (
              <p className="text-[0.75rem] leading-relaxed text-ink-muted">
                Spellings: {preview.movedAliases.join(", ")}
              </p>
            )}
            <p className="text-[0.75rem] leading-relaxed text-ink-muted">
              Result: {claimLabel(preview)}
            </p>

            {preview.refusal && (
              <p className="rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a">
                {preview.refusal}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={merging}
            className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:opacity-50 md:min-h-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={merge}
            disabled={loading || merging || !preview || Boolean(preview.refusal)}
            className="min-h-tap rounded border border-priority-a bg-priority-a/10 px-3 py-1.5 text-[0.8125rem] font-medium text-priority-a hover:bg-priority-a/20 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
          >
            {merging ? "Merging…" : "Merge payees"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
