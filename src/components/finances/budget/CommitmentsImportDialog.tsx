"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";

import {
  applyCommitmentsImportAction,
  previewCommitmentsImportAction,
} from "@/app/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import type { CommitmentsImportPreview } from "@/lib/finances/budget/commitmentsImportMutations";
import type { BudgetCategoryRow, BudgetGroupRow } from "@/lib/finances/budget/queries";

const controlClass =
  "min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink md:min-h-0 md:text-[0.8125rem]";

export function CommitmentsImportDialog({
  groups,
  categories,
  todayKey,
  onCancel,
  onImported,
}: {
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  todayKey: string;
  onCancel: () => void;
  onImported: (message: string) => void;
}) {
  const titleId = useId();
  const spendingGroups = useMemo(
    () => groups.filter((group) => !group.isIncome),
    [groups],
  );
  const initialTarget =
    spendingGroups.find(
      (group) => group.parentGroupId === null && group.name === "Spending",
    ) ??
    spendingGroups.find((group) => group.parentGroupId === null) ??
    spendingGroups[0];
  const importedBillsGroup = groups.find(
    (group) => group.sourceCommitmentKey === "bills",
  );
  const initialLegacy =
    categories.find(
      (category) => category.groupId === initialTarget?.id && category.name === "Bills",
    ) ??
    categories.find(
      (category) =>
        category.groupId === importedBillsGroup?.id && category.name === "Other bills",
    );
  const [targetGroupId, setTargetGroupId] = useState(initialTarget?.id ?? "");
  const [legacyEnvelopeId, setLegacyEnvelopeId] = useState(initialLegacy?.id ?? "");
  const [preview, setPreview] = useState<CommitmentsImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!targetGroupId) return;
    let current = true;
    startTransition(async () => {
      const result = await previewCommitmentsImportAction({
        targetGroupId,
        legacyEnvelopeId: legacyEnvelopeId || null,
      });
      if (!current) return;
      if (!result.ok) {
        setError(result.error);
      } else if (!result.data) {
        setError("Could not build the preview.");
      } else setPreview(result.data);
    });
    return () => {
      current = false;
    };
  }, [targetGroupId, legacyEnvelopeId]);

  const plan = preview?.plan;
  const actionable = plan
    ? plan.counts.createEnvelopes + plan.counts.adoptEnvelopes
    : 0;

  return (
    <ModalShell open onClose={onCancel} labelledBy={titleId} width="max-w-2xl">
      <form
        className="flex max-h-[85vh] flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!preview || plan?.blockingReason) return;
          setError(null);
          startTransition(async () => {
            const result = await applyCommitmentsImportAction({
              targetGroupId,
              legacyEnvelopeId: legacyEnvelopeId || null,
              fingerprint: preview.fingerprint,
              todayKey,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            const summary = result.data;
            onImported(
              summary
                ? `Imported ${summary.createEnvelopes + summary.adoptEnvelopes} bill envelopes and routed ${summary.transactionsRouted} transactions. Assigned amounts were not changed.`
                : "Commitments import finished. Assigned amounts were not changed.",
            );
          });
        }}
      >
        <div>
          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Budget setup
          </p>
          <h2 id={titleId} className="mt-1 text-[1rem] font-medium text-ink">
            Import commitments
          </h2>
        </div>

        <p className="text-[0.8125rem] leading-5 text-ink-muted">
          Create one envelope per active bill, grouped beneath Bills, and connect each
          one to its schedule template. This does not assign or move budget money.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-[0.8125rem] text-ink-muted">
            Place Bills inside
            <select
              value={targetGroupId}
              className={controlClass}
              onChange={(event) => {
                setPreview(null);
                setError(null);
                setTargetGroupId(event.target.value);
              }}
            >
              {spendingGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[0.8125rem] text-ink-muted">
            Existing catch-all envelope
            <select
              value={legacyEnvelopeId}
              className={controlClass}
              onChange={(event) => {
                setPreview(null);
                setError(null);
                setLegacyEnvelopeId(event.target.value);
              }}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-h-0 overflow-y-auto rounded border border-rule">
          {!plan ? (
            <p className="p-4 text-[0.8125rem] text-ink-muted">Building preview…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-rule bg-surface-raised p-3 text-[0.8125rem] md:grid-cols-4">
                <Summary label="Active" value={plan.counts.active} />
                <Summary label="New envelopes" value={plan.counts.createEnvelopes} />
                <Summary
                  label="Reused"
                  value={plan.counts.adoptEnvelopes + plan.counts.existing}
                />
                <Summary label="Conflicts" value={plan.counts.conflicts} />
              </div>
              <ul className="divide-y divide-rule">
                {plan.bills.map((bill) => (
                  <li key={bill.billId} className="flex gap-3 p-3 text-[0.8125rem]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ink">{bill.name}</p>
                      <p className="text-ink-muted">Bills › {bill.categoryName}</p>
                      {bill.reason ? (
                        <p className="mt-1 text-priority-a">{bill.reason}</p>
                      ) : null}
                    </div>
                    <span className="flex-none capitalize text-ink-muted">
                      {bill.state}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {plan?.legacyEnvelopeMove ? (
          <p className="text-[0.8125rem] text-ink-muted">
            The catch-all envelope will keep its history and become Other bills. Only
            bill-specific schedule templates move out of it.
          </p>
        ) : null}
        {plan?.blockingReason ? (
          <p className="text-[0.8125rem] text-priority-a">{plan.blockingReason}</p>
        ) : null}
        {error ? <p className="text-[0.8125rem] text-priority-a">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button type="button" className={controlClass} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${controlClass} bg-surface-raised`}
            disabled={pending || !preview || Boolean(plan?.blockingReason)}
            title={plan?.blockingReason ?? undefined}
          >
            {pending
              ? "Importing…"
              : actionable === 0
                ? "Finish import"
                : `Import ${actionable}`}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="tabular text-[1rem] font-medium text-ink">{value}</p>
      <p className="text-ink-muted">{label}</p>
    </div>
  );
}
