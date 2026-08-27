"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  mergeSupplyItemsAction,
  previewSupplyMergeAction,
} from "@/app/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import type { SupplyMergePreview } from "@/lib/finances/supplies/mutations";

/**
 * Choose the surviving item and inspect which offers move and which rates are dropped.
 *
 * Closing discards nothing written: confirm is the write.
 */
export function SupplyMergeDialog({
  items,
  onClose,
  onMerged,
}: {
  items: readonly { id: string; name: string }[];
  onClose: () => void;
  onMerged: (message: string) => void;
}) {
  const titleId = useId();
  const selectedIds = useMemo(() => items.map((item) => item.id), [items]);
  const [targetId, setTargetId] = useState(selectedIds[0] ?? "");
  const [preview, setPreview] = useState<SupplyMergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [merging, startMerging] = useTransition();

  useEffect(() => {
    if (!targetId || selectedIds.length < 2) return;
    let cancelled = false;
    startLoading(async () => {
      const result = await previewSupplyMergeAction(
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
    if (!preview) return;
    setError(null);
    startMerging(async () => {
      const result = await mergeSupplyItemsAction(
        targetId,
        selectedIds.filter((id) => id !== targetId),
      );
      if (!result.ok || !result.data) {
        setError(result.ok ? "The merge did not return a result." : result.error);
        return;
      }
      onMerged(
        `${result.data.movedOptions} offer${
          result.data.movedOptions === 1 ? "" : "s"
        } moved into ${preview.target.name}.`,
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
          Merge selected items
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          Keep one item and move the others&apos; offers onto it. The source items are
          deleted after every offer moves. The survivor keeps its name, rate, group, and
          envelope.
        </p>

        <label className="mt-5 flex flex-col gap-1 text-[0.75rem] font-medium text-ink-muted">
          Item to keep
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
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {loading && (
          <p className="mt-5 text-[0.8125rem] text-ink-muted">Checking offers…</p>
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
              <p className="mt-1 text-[0.75rem] text-ink-muted">
                {preview.target.rateLabel}
                {preview.target.groupLabel ? ` · ${preview.target.groupLabel}` : ""}
                {preview.target.envelopeName ? ` · ${preview.target.envelopeName}` : ""}
              </p>
            </div>

            <p className="text-[0.8125rem] text-ink">
              {preview.movedOptions} offer{preview.movedOptions === 1 ? "" : "s"} will
              move.
              {preview.willPromoteInUse
                ? " The survivor has no offer in use, so one moving offer will drive the totals."
                : ""}
            </p>

            {preview.discardedRates.length > 0 && (
              <p className="text-[0.75rem] leading-relaxed text-ink-muted">
                Dropped rates: {preview.discardedRates.join("; ")}
              </p>
            )}
            {preview.discardedGroups.length > 0 && (
              <p className="text-[0.75rem] leading-relaxed text-ink-muted">
                Dropped groups: {preview.discardedGroups.join(", ")}
              </p>
            )}
            {preview.discardedEnvelopes.length > 0 && (
              <p className="text-[0.75rem] leading-relaxed text-ink-muted">
                Dropped envelopes: {preview.discardedEnvelopes.join(", ")}
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
            disabled={loading || merging || !preview}
            className="min-h-tap rounded border border-priority-a bg-priority-a/10 px-3 py-1.5 text-[0.8125rem] font-medium text-priority-a hover:bg-priority-a/20 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
          >
            {merging ? "Merging…" : "Merge items"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
