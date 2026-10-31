"use client";

import {
  mergeSupplyItemsAction,
  previewSupplyMergeAction,
} from "@/app/(shell)/finances/actions";
import { MergeDialog } from "@/components/finances/MergeDialog";

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
  return (
    <MergeDialog
      records={items}
      title="Merge selected items"
      description="Keep one item and move the others' offers onto it. The source items are deleted after every offer moves. The survivor keeps its name, rate, group, and envelope."
      keepLabel="Item to keep"
      checkingLabel="Checking offers…"
      mergeLabel="Merge items"
      loadPreview={previewSupplyMergeAction}
      runMerge={mergeSupplyItemsAction}
      mergedMessage={(result, preview) =>
        `${result.movedOptions} offer${
          result.movedOptions === 1 ? "" : "s"
        } moved into ${preview.target.name}.`
      }
      targetNote={(preview) => (
        <p className="mt-1 text-[0.75rem] text-ink-muted">
          {preview.target.rateLabel}
          {preview.target.groupLabel ? ` · ${preview.target.groupLabel}` : ""}
          {preview.target.envelopeName ? ` · ${preview.target.envelopeName}` : ""}
        </p>
      )}
      details={(preview) => (
        <>
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
        </>
      )}
      onClose={onClose}
      onMerged={onMerged}
    />
  );
}
