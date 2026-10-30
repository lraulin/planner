"use client";

import { useCallback, useMemo, useState, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";

import { assignBudgetAction } from "@/app/(shell)/finances/actions";
import { useToast } from "@/components/shell/ToastProvider";
import type { BudgetMonth } from "@/lib/finances/budget/envelope";
import type { BudgetData } from "@/lib/finances/budget/queries";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import {
  needsAssignPreview,
  planAssign,
  stillNeeded,
} from "@/lib/finances/budget/assign/plan";
import {
  assignBillsFromRows,
  assignEnvelopeFromRow,
  assignHistoryWithLookback,
} from "@/lib/finances/budget/assign/fromBudget";
import { indicatorsFromAssign } from "@/lib/finances/budget/indicator";
import {
  ASSIGN_OPTIONS,
  type AssignOption,
  type AssignResult,
} from "@/lib/finances/budget/assign/types";

/**
 * Auto-assign and Fix This: the plans each option would write, which dialog is open, and
 * the write itself. Every figure is `planAssign`'s, the same function the mutation runs, so
 * the preview cannot promise what the write will not do.
 */
export function useBudgetAssign({
  data,
  month,
  previous,
  rows,
  scope,
  canFixThis,
  startTransition,
  setError,
}: {
  data: BudgetData;
  month: BudgetMonth | null;
  /** Last month, for carry-in. */
  previous: BudgetMonth | null;
  rows: readonly BudgetRow[];
  /** The envelopes the page-level Assign acts on; `undefined` is the whole month. */
  scope: readonly string[] | undefined;
  canFixThis: boolean;
  startTransition: TransitionStartFunction;
  setError: (error: string | null) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [assigning, setAssigning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [preview, setPreview] = useState<AssignResult | null>(null);
  const [previewScope, setPreviewScope] = useState<readonly string[] | undefined>();

  const commitAssign = useCallback(
    (option: AssignOption, categoryIds?: readonly string[]) => {
      setError(null);
      startTransition(async () => {
        const result = await assignBudgetAction(data.month, option, categoryIds);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const applied = result.data?.applied ?? 0;
        const problems = result.data?.errors ?? [];
        const summary =
          applied === 0
            ? "Nothing to assign."
            : `${applied === 1 ? "1 envelope" : `${applied} envelopes`} updated.`;
        if (problems.length > 0) toast.warning(summary, { body: problems.join(" ") });
        else toast.success(summary);
        setPreview(null);
        setAssigning(false);
        router.refresh();
      });
    },
    [data.month, router, toast, setError, startTransition],
  );

  /** Preview when the split or a shortfall needs a look; otherwise write immediately. */
  const startAssign = useCallback(
    (result: AssignResult, categoryIds?: readonly string[]) => {
      if (!needsAssignPreview(result)) {
        setAssigning(false);
        commitAssign(result.option, categoryIds);
        return;
      }
      setPreviewScope(categoryIds);
      setPreview(result);
    },
    [commitAssign],
  );

  const assignInputs = useMemo(() => {
    const envelopes = rows.map((row) => assignEnvelopeFromRow(row, previous));
    return {
      envelopes,
      bills: assignBillsFromRows(rows),
      history: assignHistoryWithLookback(
        data.months,
        rows.map((row) => row.id),
        data.preStartActivity,
        data.settings.startMonth,
      ),
    };
  }, [rows, previous, data.months, data.preStartActivity, data.settings.startMonth]);
  const indicators = useMemo(
    () => indicatorsFromAssign(data.month, assignInputs.envelopes, assignInputs.bills),
    [data.month, assignInputs.envelopes, assignInputs.bills],
  );
  // The header figure reads the same inputs as the grid beneath it, so the two cannot
  // disagree (`still-needed-this-month` D3).
  const stillNeededThisMonth = useMemo(
    () => stillNeeded(data.month, assignInputs.envelopes, assignInputs.bills),
    [data.month, assignInputs.envelopes, assignInputs.bills],
  );

  const assignPlans = useMemo(() => {
    if (!month) return [];
    return ASSIGN_OPTIONS.map((option) => ({
      option,
      result: planAssign({
        option,
        month: data.month,
        todayKey: data.todayKey,
        readyToAssignCents: month.readyToAssignCents,
        envelopes: assignInputs.envelopes,
        bills: assignInputs.bills,
        history: assignInputs.history,
        categoryIds: scope,
      }),
    }));
  }, [month, data.month, data.todayKey, assignInputs, scope]);

  if (fixing && !canFixThis) {
    setFixing(false);
  }

  return {
    assigning,
    fixing,
    preview,
    assignInputs,
    indicators,
    stillNeededThisMonth,
    assignPlans,
    startAssign,
    /** One option for one envelope — the row menu's Assign ▸ and the inspector's button. */
    assignOne(option: AssignOption, rowId: string) {
      if (!month) return;
      const result = planAssign({
        option,
        month: data.month,
        todayKey: data.todayKey,
        readyToAssignCents: month.readyToAssignCents,
        envelopes: assignInputs.envelopes,
        bills: assignInputs.bills,
        history: assignInputs.history,
        categoryIds: [rowId],
      });
      startAssign(result, [rowId]);
    },
    /** One option over the page's scope, as already planned for the dialog and the menu. */
    pickOption(option: AssignOption) {
      const planned = assignPlans.find((entry) => entry.option === option);
      if (!planned) return;
      startAssign(planned.result, scope);
    },
    confirmPreview() {
      if (!preview) return;
      commitAssign(preview.option, previewScope);
    },
    openAssign() {
      setFixing(false);
      setAssigning(true);
    },
    openFixThis() {
      setAssigning(false);
      setFixing(true);
    },
    closeAssign: () => setAssigning(false),
    closeFixThis: () => setFixing(false),
    closePreview: () => setPreview(null),
  };
}

export type BudgetAssign = ReturnType<typeof useBudgetAssign>;
