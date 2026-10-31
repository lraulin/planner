"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type { DataActionResult, QueryResult } from "@/app/actionResult";
import { ModalShell } from "@/components/detail/ModalShell";

/** What every merge preview names: the survivor and the records folding into it. */
type MergePreview = {
  target: { name: string };
  sources: readonly { name: string }[];
};

/**
 * Merge several records into one the user picks — payees, supply items. The server
 * previews the merge for the chosen survivor; nothing is written until Merge.
 *
 * Changing the survivor discards the old preview and asks again, and a preview that
 * arrives after the dialog has moved on is dropped.
 */
export function MergeDialog<Preview extends MergePreview, Result>({
  records,
  title,
  description,
  keepLabel,
  checkingLabel,
  mergeLabel,
  loadPreview,
  runMerge,
  targetNote,
  details,
  refusal,
  mergedMessage,
  onClose,
  onMerged,
}: {
  /** The selected records; the first is the default survivor. */
  records: readonly { id: string; name: string }[];
  title: string;
  description: ReactNode;
  /** Label of the survivor picker: "Payee to keep". */
  keepLabel: string;
  /** Shown while the preview loads: "Checking references…". */
  checkingLabel: string;
  /** The confirm button: "Merge payees". */
  mergeLabel: string;
  loadPreview: (targetId: string, sourceIds: string[]) => Promise<QueryResult<Preview>>;
  runMerge: (
    targetId: string,
    sourceIds: string[],
  ) => Promise<DataActionResult<Result>>;
  /** A line about the survivor itself, inside the "Merging into" box. */
  targetNote?: (preview: Preview) => ReactNode;
  /** What the preview says will move, under the "Merging into" box. */
  details: (preview: Preview) => ReactNode;
  /** Why this merge cannot go ahead, if it cannot; disables Merge. */
  refusal?: (preview: Preview) => string | null;
  mergedMessage: (result: Result, preview: Preview) => string;
  onClose: () => void;
  onMerged: (message: string) => void;
}) {
  const titleId = useId();
  const selectedIds = useMemo(() => records.map((record) => record.id), [records]);
  const [targetId, setTargetId] = useState(selectedIds[0] ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [merging, startMerging] = useTransition();
  const refused = preview && refusal ? refusal(preview) : null;

  useEffect(() => {
    if (!targetId || selectedIds.length < 2) return;
    let cancelled = false;
    startLoading(async () => {
      const result = await loadPreview(
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
  }, [selectedIds, targetId, loadPreview]);

  function merge() {
    if (!preview || refused) return;
    setError(null);
    startMerging(async () => {
      const result = await runMerge(
        targetId,
        selectedIds.filter((id) => id !== targetId),
      );
      if (!result.ok || !result.data) {
        setError(result.ok ? "The merge did not return a result." : result.error);
        return;
      }
      onMerged(mergedMessage(result.data, preview));
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
          {title}
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          {description}
        </p>

        <label className="mt-5 flex flex-col gap-1 text-[0.75rem] font-medium text-ink-muted">
          {keepLabel}
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
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {record.name}
              </option>
            ))}
          </select>
        </label>

        {loading && (
          <p className="mt-5 text-[0.8125rem] text-ink-muted">{checkingLabel}</p>
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
              {targetNote?.(preview)}
            </div>

            {details(preview)}

            {refused && (
              <p className="rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a">
                {refused}
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
            disabled={loading || merging || !preview || Boolean(refused)}
            className="min-h-tap rounded border border-priority-a bg-priority-a/10 px-3 py-1.5 text-[0.8125rem] font-medium text-priority-a hover:bg-priority-a/20 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
          >
            {merging ? "Merging…" : mergeLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
