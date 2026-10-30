"use client";

import { budgetOperationAction } from "@/app/(shell)/finances/actions";
import type { BillAnchor } from "@/lib/finances/commitments";
import type { BudgetMonth } from "@/lib/finances/budget/envelope";
import type { BudgetData } from "@/lib/finances/budget/queries";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import { AssignDialog, AssignPreviewDialog } from "./AssignDialog";
import { FixThisDialog } from "./FixThisDialog";
import type { BudgetAssign } from "./useBudgetAssign";
import type { BudgetRun } from "./useBudgetRun";

/** Whichever of Fix This, Assign and its preview is open — at most one at a time. */
export function AssignFlowDialogs({
  assign,
  canFixThis,
  data,
  anchors,
  month,
  rows,
  envelopes,
  showHidden,
  pending,
  run,
}: {
  assign: BudgetAssign;
  canFixThis: boolean;
  data: BudgetData;
  anchors: ReadonlyMap<string, BillAnchor>;
  month: BudgetMonth;
  rows: readonly BudgetRow[];
  /** What the manual picker offers: every assignable envelope, in page order. */
  envelopes: readonly BudgetRow[];
  showHidden: boolean;
  pending: boolean;
  run: BudgetRun;
}) {
  return (
    <>
      {assign.fixing && canFixThis ? (
        <FixThisDialog
          viewedMonth={data.month}
          months={data.months}
          groups={data.groups}
          categories={data.categories}
          goals={data.goals}
          anchors={anchors}
          showHidden={showHidden}
          pending={pending}
          onCancel={assign.closeFixThis}
          onUnassign={(sourceMonth, from, amountCents) =>
            run(() =>
              budgetOperationAction({
                kind: "unassign",
                month: sourceMonth,
                from,
                amountCents,
              }),
            )
          }
        />
      ) : null}
      {assign.assigning && !assign.preview ? (
        <AssignDialog
          readyToAssignCents={month.readyToAssignCents}
          options={assign.assignPlans}
          envelopes={envelopes}
          groups={data.groups}
          pending={pending}
          onCancel={assign.closeAssign}
          onPickOption={assign.pickOption}
          onManual={(categoryId, amountCents) => {
            const target = rows.find((row) => row.id === categoryId);
            assign.closeAssign();
            if (!target) return;
            run(() =>
              budgetOperationAction({
                kind: "assign-remaining",
                month: data.month,
                to: { id: target.id, name: target.name },
                amountCents,
              }),
            );
          }}
        />
      ) : null}
      {assign.preview ? (
        <AssignPreviewDialog
          result={assign.preview}
          pending={pending}
          onCancel={assign.closePreview}
          onConfirm={assign.confirmPreview}
        />
      ) : null}
    </>
  );
}
