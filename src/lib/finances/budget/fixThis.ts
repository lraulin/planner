/**
 * Source register for Fix This: which months and envelopes still have Available to give
 * back to Ready to Assign, and the default amount for one pick.
 *
 * The hole is the viewed month's Ready to Assign. The source month is the picker. Writing a
 * later month's assigned is how assigned-in-future recovers current Ready to Assign — this
 * module only decides what the dialog can offer.
 *
 * Spec: `agent-os/specs/2026-08-29-2033-budget-fix-this/` D3–D4.
 */

import type { EnvelopeKind } from "@/db/schema";
import { formatUsd } from "@/lib/finances/money";

import {
  categoryMonth,
  monthKeyOf,
  monthLabel,
  type BudgetMonth,
  type MonthKey,
} from "./envelope";
import { CATEGORY_SECTIONS } from "./groupEnvelopeOptions";
import { budgetChildren } from "./hierarchy";
import { unassignMovedCents } from "./operations";
import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";

const SOURCE_SECTIONS = CATEGORY_SECTIONS.filter(
  (section) => section.kind !== "income",
);

export type FixThisRow =
  | {
      kind: "heading";
      id: string;
      label: string;
      depth: number;
      scope: "type" | "group";
    }
  | {
      kind: "envelope";
      id: string;
      name: string;
      depth: number;
      availableCents: number;
    };

export type FixThisSection = {
  kind: Exclude<EnvelopeKind, "income">;
  label: string;
  rows: FixThisRow[];
};

export function fixThisHoleCents(readyToAssignCents: number): number {
  return Math.max(0, -readyToAssignCents);
}

/**
 * Default amount for a picked envelope: drain it, but not past the viewed month's hole.
 * MAX in the dialog is Available, which may overshoot Ready to Assign to positive.
 */
export function defaultUnassignCents(
  availableCents: number,
  viewedReadyToAssignCents: number,
): number {
  return Math.min(
    Math.max(0, availableCents),
    fixThisHoleCents(viewedReadyToAssignCents),
  );
}

export function fixThisUnavailableReason(params: {
  viewedMonth: MonthKey;
  todayKey: string;
  readyToAssignCents: number;
}): string | null {
  if (params.viewedMonth < monthKeyOf(params.todayKey)) {
    return "Past months stay historical.";
  }
  if (params.readyToAssignCents >= 0) {
    return "Ready to Assign is not negative";
  }
  return null;
}

export function fixThisEmptyCopy(month: MonthKey): string {
  return `Nothing in ${monthLabel(month)} has Available to un-assign.`;
}

export function unassignPreview(params: {
  name: string;
  availableCents: number;
  amountCents: number;
  viewedReadyToAssignCents: number;
}): { availableLine: string; readyLine: string } | null {
  const moved = unassignMovedCents(params.amountCents, params.availableCents);
  if (moved <= 0) return null;
  const nextAvailable = params.availableCents - moved;
  const nextReady = params.viewedReadyToAssignCents + moved;
  return {
    availableLine: `This will take ${params.name} from ${formatUsd(params.availableCents)} Available to ${formatUsd(nextAvailable)}.`,
    readyLine: `Ready to Assign from ${formatUsd(params.viewedReadyToAssignCents)} to ${formatUsd(nextReady)}.`,
  };
}

/**
 * Viewed month (even if empty) plus later months that still have something to raid.
 * Past months relative to the viewed one never appear — the hole is here, the source is
 * here or later.
 */
export function fixThisSourceMonths(params: {
  months: readonly BudgetMonth[];
  viewedMonth: MonthKey;
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  showHidden: boolean;
}): MonthKey[] {
  const viewed = params.months.find((entry) => entry.month === params.viewedMonth);
  if (!viewed) return [];

  const later = params.months.filter((entry) => entry.month > params.viewedMonth);
  const keys: MonthKey[] = [viewed.month];
  for (const entry of later) {
    if (
      fixThisSections({
        month: entry,
        groups: params.groups,
        categories: params.categories,
        showHidden: params.showHidden,
      }).length > 0
    ) {
      keys.push(entry.month);
    }
  }
  return keys;
}

/**
 * Regular spending / Bills / Savings, group headings as on the Budget tables, only
 * envelopes with Available `> 0`. Income never appears. Hidden envelopes (and hidden
 * groups) follow `showHidden`.
 */
export function fixThisSections(params: {
  month: BudgetMonth;
  groups: readonly BudgetGroupRow[];
  categories: readonly BudgetCategoryRow[];
  showHidden: boolean;
}): FixThisSection[] {
  const visibleGroups = params.showHidden
    ? params.groups
    : params.groups.filter((group) => !group.hidden);
  const visibleGroupIds = new Set(visibleGroups.map((group) => group.id));

  const raidable = params.categories.filter((category) => {
    if (category.kind === "income") return false;
    if (!params.showHidden && category.hidden) return false;
    if (category.groupId !== null && !visibleGroupIds.has(category.groupId)) {
      return false;
    }
    return categoryMonth(params.month, category.id).balanceCents > 0;
  });

  const sections: FixThisSection[] = [];
  for (const section of SOURCE_SECTIONS) {
    const ofKind = raidable.filter((category) => category.kind === section.kind);
    const ofKindGroups = visibleGroups.filter((group) => group.kind === section.kind);
    const tree = walkSection(section.kind, ofKindGroups, ofKind, params.month);
    if (tree.length === 0) continue;
    sections.push({
      kind: section.kind,
      label: section.label,
      rows: [
        {
          kind: "heading",
          id: `type:${section.kind}`,
          label: section.label,
          depth: 0,
          scope: "type",
        },
        ...tree,
      ],
    });
  }
  return sections;
}

function walkSection(
  typeKind: EnvelopeKind,
  groups: readonly BudgetGroupRow[],
  envelopes: readonly BudgetCategoryRow[],
  month: BudgetMonth,
): FixThisRow[] {
  const rows: FixThisRow[] = [];
  const emitted = new Set<string>();
  const envelopeById = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  function emitGroup(groupId: string, depth: number): number {
    if (emitted.has(groupId)) throw new Error("Budget groups contain a cycle.");
    const group = groupById.get(groupId);
    if (!group) return 0;
    emitted.add(groupId);

    const headerIndex = rows.length;
    rows.push({
      kind: "heading",
      id: `group:${typeKind}:${group.id}`,
      label: group.name,
      depth,
      scope: "group",
    });

    let count = 0;
    for (const child of budgetChildren(groups, envelopes, group.id)) {
      if (child.kind === "group") {
        count += emitGroup(child.id, depth + 1);
        continue;
      }
      const envelope = envelopeById.get(child.id);
      if (!envelope) continue;
      rows.push({
        kind: "envelope",
        id: envelope.id,
        name: envelope.name,
        depth: depth + 1,
        availableCents: categoryMonth(month, envelope.id).balanceCents,
      });
      count += 1;
    }

    if (count === 0) {
      rows.splice(headerIndex, 1);
      emitted.delete(groupId);
      return 0;
    }
    return count;
  }

  for (const root of budgetChildren(groups, envelopes, null)) {
    if (root.kind === "group") {
      emitGroup(root.id, 0);
      continue;
    }
    const envelope = envelopeById.get(root.id);
    if (!envelope) continue;
    rows.push({
      kind: "envelope",
      id: envelope.id,
      name: envelope.name,
      depth: 0,
      availableCents: categoryMonth(month, envelope.id).balanceCents,
    });
  }
  return rows;
}
