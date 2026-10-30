"use client";

import { useEffect, useMemo, useRef } from "react";

import type { Command } from "@/lib/commands/registry";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import type { EnvelopeKind } from "@/db/schema";
import type { BudgetMonth } from "@/lib/finances/budget/envelope";
import { fixThisUnavailableReason } from "@/lib/finances/budget/fixThis";
import type { BudgetStructureRef } from "@/lib/finances/budget/hierarchy";
import type { BudgetData } from "@/lib/finances/budget/queries";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import {
  ASSIGN_OPTIONS,
  ASSIGN_OPTION_LABELS,
  type AssignResult,
} from "@/lib/finances/budget/assign/types";
import type { ComposerTarget } from "./StructureComposer";

/** What the commands do, read at run time — see `useBudgetCommands`. */
type CommandHandlers = {
  openComposer: (
    what: ComposerTarget["what"],
    kind: EnvelopeKind,
    groupId: string | null,
  ) => void;
  moveRelative: (moving: BudgetStructureRef, direction: -1 | 1) => void;
  openMoveToGroupMenu: (row: BudgetRow) => void;
  /** Which section a bare "New envelope"/"New group" lands in. */
  newKindForFocus: () => EnvelopeKind;
  startRename: (id: string) => void;
  startDelete: (row: BudgetRow) => void;
  openFixThis: () => void;
};

/**
 * The page's catalog: the structure commands, Fix This, and one command per Assign option.
 *
 * Every gesture the page grew is a declared command: a command without a menu is not
 * shipped (`navigation.md`). The row commands act on the focused table's selected row,
 * which is the same row the inspector is showing.
 */
export function useBudgetCommands({
  data,
  month,
  canFixThis,
  selectedRow,
  assignPlans,
  scope,
  startAssign,
  handlers,
}: {
  data: Pick<BudgetData, "month" | "todayKey">;
  month: BudgetMonth | null;
  canFixThis: boolean;
  selectedRow: BudgetRow | null;
  assignPlans: readonly {
    option: (typeof ASSIGN_OPTIONS)[number];
    result: AssignResult;
  }[];
  scope: readonly string[] | undefined;
  startAssign: (result: AssignResult, categoryIds?: readonly string[]) => void;
  handlers: CommandHandlers;
}) {
  /**
   * The handlers, read at run time.
   *
   * Same trick as the export commands and for the same reason: these close over
   * `data.groups` / `data.categories`, so putting them in the command memo's deps would
   * rebuild — and re-register — the whole catalog on every refresh. What the commands need
   * *reactively* is only whether a row is selected, which stays a real dependency.
   */
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const commands = useMemo((): Command[] => {
    const assignCommands: Command[] = ASSIGN_OPTIONS.map((option) => {
      const planned = assignPlans.find((entry) => entry.option === option);
      const empty =
        !planned ||
        (planned.result.listAmountCents === 0 && planned.result.lines.length === 0);
      return {
        id: `budget.assign.${option}`,
        label: ASSIGN_OPTION_LABELS[option],
        group: "view",
        menu: "tools",
        section: "Assign",
        keywords: "auto assign underfunded ynab ready",
        disabled: empty,
        title: empty ? "Nothing to change for this option" : undefined,
        run: () => {
          if (!planned) return;
          startAssign(planned.result, scope);
        },
      };
    });

    const structureCommands: Command[] = [
      {
        id: "budget.envelope.new",
        label: "New envelope",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "new",
        keywords: "create add category bucket",
        run: () =>
          handlersRef.current.openComposer(
            "envelope",
            handlersRef.current.newKindForFocus(),
            null,
          ),
      },
      {
        id: "budget.bill.new",
        label: "New bill",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "new",
        keywords: "create add subscription recurring",
        title:
          "A bill starts monthly; set its real cadence and amount in the inspector",
        run: () => handlersRef.current.openComposer("envelope", "bill", null),
      },
      {
        id: "budget.group.new",
        label: "New group",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "insert-child",
        keywords: "create add folder section",
        run: () =>
          handlersRef.current.openComposer(
            "group",
            handlersRef.current.newKindForFocus(),
            null,
          ),
      },
      {
        id: "budget.row.rename",
        label: "Rename envelope",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "rename",
        keywords: "name edit title",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () => selectedRow && handlersRef.current.startRename(selectedRow.id),
      },
      {
        id: "budget.row.move-up",
        label: "Move envelope up",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "move-up",
        keywords: "reorder sort order",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () =>
          selectedRow &&
          handlersRef.current.moveRelative(
            { kind: "category", id: selectedRow.id },
            -1,
          ),
      },
      {
        id: "budget.row.move-down",
        label: "Move envelope down",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "move-down",
        keywords: "reorder sort order",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () =>
          selectedRow &&
          handlersRef.current.moveRelative({ kind: "category", id: selectedRow.id }, 1),
      },
      {
        id: "budget.row.move-to-group",
        label: "Move envelope to group…",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "convert",
        keywords: "reparent nest folder",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () => selectedRow && handlersRef.current.openMoveToGroupMenu(selectedRow),
      },
      {
        id: "budget.row.delete",
        label: "Delete envelope…",
        group: "record",
        menu: "organize",
        section: "Budget",
        icon: "delete",
        keywords: "remove destroy",
        disabled: !selectedRow,
        title: selectedRow ? undefined : "Select an envelope first",
        run: () => selectedRow && handlersRef.current.startDelete(selectedRow),
      },
    ];

    const fixThisReason = canFixThis
      ? null
      : (fixThisUnavailableReason({
          viewedMonth: data.month,
          todayKey: data.todayKey,
          readyToAssignCents: month?.readyToAssignCents ?? 0,
        }) ?? "Ready to Assign is not negative");

    return [
      ...structureCommands,
      {
        id: "budget.fix-this",
        label: "Fix This",
        group: "view",
        menu: "tools",
        keywords: "unassign negative ready over-assigned ynab",
        disabled: fixThisReason !== null,
        title: fixThisReason ?? undefined,
        run: () => {
          if (fixThisReason) return;
          handlersRef.current.openFixThis();
        },
      },
      ...assignCommands,
    ];
  }, [
    assignPlans,
    scope,
    startAssign,
    selectedRow,
    data.month,
    data.todayKey,
    month,
    canFixThis,
  ]);

  useRegisterCommands(commands);
}
