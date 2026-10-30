import {
  budgetOperationAction,
  setCarryoverAction,
  setTargetSnoozeAction,
  updateBudgetCategoryAction,
} from "@/app/(shell)/finances/actions";
import type { MenuItem } from "@/components/grid/ContextMenu";
import type { EnvelopeKind } from "@/db/schema";
import {
  monthKeyOf,
  monthLabel,
  monthName,
  type BudgetMonth,
} from "@/lib/finances/budget/envelope";
import {
  ASSIGN_OPTIONS,
  ASSIGN_OPTION_LABELS,
  type AssignOption,
} from "@/lib/finances/budget/assign/types";
import type { BudgetData } from "@/lib/finances/budget/queries";
import { coverSources, moveTargets, type BudgetRow } from "@/lib/finances/budget/rows";
import { snoozeUnavailableReason } from "@/lib/finances/budget/snooze";
import { formatUsd } from "@/lib/finances/money";
import { withScheme } from "./UrlCell";
import type { BudgetRun } from "./useBudgetRun";
import type { BudgetStructure } from "./useBudgetStructure";

/** "Change section ▸" — the page's own headings, in page order. */
const SECTION_CHOICES: { kind: EnvelopeKind; label: string }[] = [
  { kind: "income", label: "Income" },
  { kind: "spending", label: "Regular spending" },
  { kind: "bill", label: "Bills" },
  { kind: "savings", label: "Savings" },
];

export type RowMenuContext = {
  rows: readonly BudgetRow[];
  /** The month on screen, for what Ready to Assign can still cover. */
  month: BudgetMonth;
  monthKey: BudgetData["month"];
  todayKey: string;
  run: BudgetRun;
  openMove: (from: BudgetRow, targets: BudgetRow[]) => void;
  editTarget: (id: string) => void;
  editPayees: (row: BudgetRow) => void;
  assignOne: (option: AssignOption, rowId: string) => void;
  structureMenuItems: BudgetStructure["structureMenuItems"];
};

/**
 * Everything one envelope row offers: moving money, its target and snooze, bill extras,
 * its section and visibility, then the structure five every row and group share.
 *
 * The Available cell, a right-click and a long-press on a phone all open this one list.
 */
export function rowMenuItems(row: BudgetRow, ctx: RowMenuContext): MenuItem[] {
  const { month, monthKey, run } = ctx;
  const sources = coverSources(ctx.rows, row.id);
  const ref = { id: row.id, name: row.name };
  const overspent = row.balanceCents < 0;
  const { bill } = row;
  const snoozeReason = snoozeUnavailableReason(row, monthKey, monthKeyOf(ctx.todayKey));

  return [
    {
      label: "Cover overspending from",
      // Unavailable is disabled with the reason, never absent (`navigation.md`).
      title: overspent
        ? undefined
        : `${row.name} is not overspent, so there is nothing to cover`,
      disabled: !overspent || (sources.length === 0 && month.readyToAssignCents <= 0),
      items: [
        {
          label: `Ready to Assign (${formatUsd(Math.max(0, month.readyToAssignCents))})`,
          disabled: month.readyToAssignCents <= 0,
          title:
            month.readyToAssignCents <= 0
              ? "Nothing is left to assign this month"
              : undefined,
          onSelect: () =>
            run(() =>
              budgetOperationAction({
                kind: "cover",
                month: monthKey,
                from: null,
                to: ref,
              }),
            ),
        },
        ...sources.map((source) => ({
          label: `${source.name} (${formatUsd(source.balanceCents)})`,
          onSelect: () =>
            run(() =>
              budgetOperationAction({
                kind: "cover",
                month: monthKey,
                from: { id: source.id, name: source.name },
                to: ref,
              }),
            ),
        })),
      ],
    },
    {
      label: "Move money to…",
      disabled: row.balanceCents <= 0,
      title:
        row.balanceCents <= 0 ? `${row.name} has nothing in it to move` : undefined,
      onSelect: () => ctx.openMove(row, moveTargets(ctx.rows, row.id)),
    },
    "separator",
    {
      label: row.carryover
        ? "Stop rolling overspending forward"
        : "Roll overspending forward",
      title: `Applies to ${monthLabel(monthKey)} and every later month. ${
        row.carryover
          ? "Overspending will go back to reducing Ready to Assign."
          : "Overspending stays in this envelope instead of reducing Ready to Assign."
      }`,
      onSelect: () => run(() => setCarryoverAction(monthKey, row.id, !row.carryover)),
    },
    {
      label: row.snoozed ? "Stop snoozing" : `Snooze target for ${monthName(monthKey)}`,
      // Unavailable is disabled with the reason, and it is the *same* reason the mutation
      // rejects with (`snoozeUnavailableReason`), so the two cannot drift apart.
      disabled: snoozeReason !== null,
      title:
        snoozeReason ??
        (row.snoozed
          ? `${row.name} will ask for its target again.`
          : `${row.name} stops asking for the rest of ${monthName(monthKey)}. It lapses on its own next month.`),
      onSelect: () => run(() => setTargetSnoozeAction(monthKey, row.id, !row.snoozed)),
    },
    "separator",
    {
      label: "Edit target…",
      title: row.isIncome
        ? "Income feeds Ready to Assign, so it holds no target"
        : `What ${row.name} should ask for each month`,
      disabled: row.isIncome,
      onSelect: () => ctx.editTarget(row.id),
    },
    {
      label: "Assign",
      disabled: row.isIncome,
      title: row.isIncome
        ? "Income feeds Ready to Assign, so it is never assigned"
        : `Auto-assign options for ${row.name} only`,
      items: ASSIGN_OPTIONS.map((option) => ({
        label: ASSIGN_OPTION_LABELS[option],
        onSelect: () => ctx.assignOne(option, row.id),
      })),
    },
    ...(bill
      ? ([
          "separator" as const,
          {
            label: "Edit payees…",
            title: "Charges from these payees belong to this bill",
            onSelect: () => ctx.editPayees(row),
          },
          {
            label: "Open URL",
            disabled: bill.url === "",
            title: bill.url === "" ? "No URL saved for this bill" : bill.url,
            onSelect: () => window.open(withScheme(bill.url), "_blank"),
          },
        ] satisfies MenuItem[])
      : []),
    "separator",
    {
      label: "Change section",
      icon: "convert",
      title: `Which table ${row.name} lives in`,
      items: SECTION_CHOICES.map((choice) => ({
        label: choice.label,
        icon: choice.kind === row.kind ? ("complete" as const) : undefined,
        disabled: choice.kind === row.kind,
        title: choice.kind === row.kind ? `${row.name} is already here` : undefined,
        onSelect: () =>
          run(() => updateBudgetCategoryAction(row.id, { kind: choice.kind })),
      })),
    },
    {
      label: row.hidden ? "Show envelope" : "Hide envelope",
      title: "A hidden envelope keeps its history and still counts toward the totals",
      onSelect: () =>
        run(() => updateBudgetCategoryAction(row.id, { hidden: !row.hidden })),
    },
    "separator",
    ...ctx.structureMenuItems({ kind: "category", id: row.id }, row.name),
  ];
}
