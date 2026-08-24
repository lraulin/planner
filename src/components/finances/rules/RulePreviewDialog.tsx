"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { previewRulesAction, reclassifyAction } from "@/app/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import type { DerivedPreview } from "@/lib/finances/mutations";
import { formatUsd } from "@/lib/finances/money";

/**
 * What running the rules would change, before it changes it.
 *
 * **The preview is the whole planner, not just the matcher.** A rule that names a flow enters
 * the income-cadence detector, which moves the median paycheck and with it every figure on the
 * dashboard — so a preview of "rows whose category would change" would understate the most
 * dangerous edit available here. Both derived columns are reported, and the counts come from
 * the same comparison the write uses, so what is confirmed is what lands.
 */
function TransitionList({
  title,
  diff,
}: {
  title: string;
  diff: DerivedPreview["flow"];
}) {
  return (
    <div className="rounded border border-rule bg-surface-raised/40 p-3">
      <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {title}
      </p>
      {diff.changed === 0 ? (
        <p className="mt-1 text-[0.8125rem] text-ink">Nothing changes.</p>
      ) : (
        <>
          <p className="mt-1 text-[0.8125rem] text-ink">
            {diff.changed.toLocaleString()} of {diff.scanned.toLocaleString()} rows
          </p>
          <ul className="mt-2 space-y-1">
            {diff.transitions.slice(0, 8).map((transition) => (
              <li
                key={`${transition.from}-${transition.to}`}
                className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
              >
                <span className="min-w-0 truncate text-ink-muted">
                  {transition.from ?? "none"} → {transition.to ?? "none"}
                </span>
                <span className="shrink-0 tabular-nums text-ink">
                  {transition.rows} · {formatUsd(transition.cents)}
                </span>
              </li>
            ))}
            {diff.transitions.length > 8 && (
              <li className="text-[0.75rem] text-ink-muted">
                and {diff.transitions.length - 8} more
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

export function RulePreviewDialog({
  onClose,
  onRan,
}: {
  onClose: () => void;
  onRan: (message: string) => void;
}) {
  const titleId = useId();
  const [preview, setPreview] = useState<DerivedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [running, startRunning] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startLoading(async () => {
      const result = await previewRulesAction();
      if (cancelled) return;
      if (result.ok && result.data) setPreview(result.data);
      else setError(result.ok ? "The preview returned nothing." : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function run() {
    setError(null);
    startRunning(async () => {
      const result = await reclassifyAction();
      if (!result.ok || !result.data) {
        setError(result.ok ? "The run returned no result." : result.error);
        return;
      }
      onRan(
        `${result.data.updated.toLocaleString()} of ${result.data.scanned.toLocaleString()} rows updated.`,
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
          Run rules
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          Re-reads every transaction and applies every matching rule in visible order.
          Later Category and Flow actions win; Add tag actions combine without
          duplicates.
        </p>

        {loading && (
          <p className="mt-5 text-[0.8125rem] text-ink-muted">
            Working out the change…
          </p>
        )}

        {preview && (
          <div className="mt-5 space-y-3">
            <div className="rounded border border-rule bg-surface-raised/40 p-3">
              <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                Whole run
              </p>
              <p className="mt-1 text-[0.8125rem] text-ink">
                {preview.updated.toLocaleString()} of {preview.scanned.toLocaleString()}{" "}
                rows change
              </p>
            </div>
            <TransitionList title="Category" diff={preview.category} />
            <TransitionList title="Flow" diff={preview.flow} />
            <div className="rounded border border-rule bg-surface-raised/40 p-3">
              <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                Income cadence
              </p>
              <dl className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[0.8125rem]">
                <dt className="text-ink-muted" />
                <dd className="text-ink-muted">Before</dd>
                <dd className="text-ink-muted">After</dd>
                <dt className="text-ink-muted">Paydays</dt>
                <dd className="text-right tabular-nums text-ink">
                  {preview.income.before.paydayCount}
                </dd>
                <dd className="text-right tabular-nums text-ink">
                  {preview.income.after.paydayCount}
                </dd>
                <dt className="text-ink-muted">Median paycheck</dt>
                <dd className="text-right tabular-nums text-ink">
                  {formatUsd(preview.income.before.medianPaycheckCents)}
                </dd>
                <dd className="text-right tabular-nums text-ink">
                  {formatUsd(preview.income.after.medianPaycheckCents)}
                </dd>
                <dt className="text-ink-muted">Normalized month</dt>
                <dd className="text-right tabular-nums text-ink">
                  {formatUsd(preview.income.before.normalizedMonthlyIncomeCents)}
                </dd>
                <dd className="text-right tabular-nums text-ink">
                  {formatUsd(preview.income.after.normalizedMonthlyIncomeCents)}
                </dd>
              </dl>
            </div>
            {preview.problems.length > 0 && (
              <div className="rounded border border-rule p-3">
                <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-priority-a">
                  Not running
                </p>
                <ul className="mt-1 space-y-1 text-[0.8125rem] text-ink-muted">
                  {preview.problems.map((problem) => (
                    <li key={problem.name}>
                      {problem.name} — {problem.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-[0.8125rem] text-priority-a">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
            onClick={onClose}
            disabled={running}
          >
            Cancel
          </button>
          <button
            type="button"
            className="min-h-tap rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
            onClick={run}
            disabled={running || loading || preview === null}
          >
            {running ? "Running…" : "Run rules"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
