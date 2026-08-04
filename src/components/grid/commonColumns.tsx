"use client";

import type { NodeState, PriorityLetter } from "@/db/schema";
import { encodePriority } from "@/lib/achieve/encodings";
import { localDateKey, toDateKey } from "@/lib/schedule/geometry";
import type { OutlineNode } from "@/lib/tree/types";
import {
  formatCompactDate,
  formatEffort,
  formatMoney,
  formatPriority,
} from "@/lib/tree/format";
import { kindOfNode, STATE_CODES, STATE_LABELS } from "@/lib/tree/hierarchy";
import {
  scheduleStatusForNode,
  STATUS_LABELS,
  type ScheduleStatus,
} from "@/lib/tree/status";
import { TypeIcon } from "@/components/icons/TypeIcon";
import type { ColumnDef } from "./columns";
import {
  AbbrStateCell,
  DeadlineCell,
  FocusCell,
  NameCell,
  PercentCell,
  PriorityCell,
  ReadOnlyCell,
  StateCell,
  StatusCell,
} from "./cells";

/**
 * Column definitions shared by the node grids.
 *
 * `priority` and `deadline` were byte-identical in four files; `abbrState` in three and
 * `percent` in two. Those live here now, so a change to how a priority filters happens
 * once instead of four times with three of them silently drifting.
 *
 * **Not everything with a shared id belongs here.** `effort`, `effortLeft`, `status`,
 * `focus`, `lap` and `tcPriority` also repeat across tabs, but they genuinely differ —
 * Projects renders effort-left as a read-only rollup where Tasks lets you edit it, the
 * Chooser's TC Priority is assignable where the Tasks one is not, only Projects sorts by
 * status. Forcing those into a factory would mean three or four option flags each, which
 * is harder to read than the duplication and easier to get wrong.
 */

/**
 * Callbacks and rendering context the node columns close over. Kept as a single object so
 * column defs stay pure data + render, and each grid can swap the handlers freely.
 */
export type OutlineColumnCtx = {
  today: string | null;
  selectedId: string | null;
  editingId: string | null;
  onToggleCollapsed: (node: OutlineNode) => void;
  onOpenDetail: (node: OutlineNode) => void;
  onFinishEdit: (node: OutlineNode, name: string) => void;
  onCancelEdit: () => void;
  onPriorityChange: (
    node: OutlineNode,
    letter: PriorityLetter | null,
    rank: number | null,
  ) => void;
  onStateChange: (node: OutlineNode, state: NodeState) => void;
  onFocusChange: (node: OutlineNode, focus: boolean) => void;
  onDeadlineChange: (node: OutlineNode, deadline: string | null) => void;
  onEffortChange: (node: OutlineNode, minutes: number | null) => void;
};

/**
 * Achieve's two-letter State codes back to their full labels, for the set filter. Built
 * from `STATE_CODES` rather than written out again, so a new state cannot appear in one
 * map and not the other.
 */
const STATE_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  (Object.keys(STATE_CODES) as (keyof typeof STATE_CODES)[]).map((state) => [
    STATE_CODES[state],
    STATE_LABELS[state],
  ]),
);

/** ABCD priority with its rank — `A1`, `B`, or blank. */
export function priorityColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "priority",
    label: "Pri",
    width: "3rem",
    align: "center",
    filterKind: "priority",
    filterValue: (row) =>
      formatPriority(row.node.priorityLetter, row.node.priorityRank) || null,
    // Achieve's int encoding so A1 < A2 < A10 < B, and blank sorts last (null).
    sortValue: (row) =>
      row.node.priorityLetter
        ? encodePriority({
            letter: row.node.priorityLetter,
            rank: row.node.priorityRank,
          })
        : null,
    render: (row, ctx) => (
      <PriorityCell
        key={`priority:${formatPriority(row.node.priorityLetter, row.node.priorityRank)}`}
        node={row.node}
        onChange={(letter, rank) => ctx.onPriorityChange(row.node, letter, rank)}
      />
    ),
  };
}

export function deadlineColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "deadline",
    label: "Deadline",
    width: "7rem",
    align: "right",
    filterKind: "date",
    filterValue: (row) => (row.node.deadline ? toDateKey(row.node.deadline) : null),
    sortValue: (row) => (row.node.deadline ? toDateKey(row.node.deadline) : null),
    // The filter's day key is the wrong shape for a meta chip; "12 Sep" is the same
    // information in a third of the width.
    compactText: (row) =>
      formatCompactDate(
        row.node.deadline ? toDateKey(row.node.deadline) : null,
        new Date().getFullYear(),
      ),
    render: (row, ctx) => (
      <DeadlineCell
        node={row.node}
        today={ctx.today}
        onChange={(deadline) => ctx.onDeadlineChange(row.node, deadline)}
      />
    ),
  };
}

/** Achieve's two-letter State code — `NS`, `IP`, `C`. */
export function abbrStateColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "abbrState",
    label: "State",
    width: "3.5rem",
    align: "center",
    filterKind: "enum",
    // Filters on the code, because that is what the cell shows and what stored filters
    // already match on; the set filter spells it out via `filterLabel`.
    filterValue: (row) => STATE_CODES[row.node.state],
    filterLabel: (code) => STATE_LABEL_BY_CODE[code] ?? code,
    sortValue: (row) => row.node.state,
    render: (row, ctx) => (
      <AbbrStateCell
        node={row.node}
        onChange={(state) => ctx.onStateChange(row.node, state)}
      />
    ),
  };
}

/**
 * Category, inherited from the nearest ancestor that carries one (`effectiveCategory`, see
 * `derive.ts`). Read-only: the value belongs to the Result Area that set it, and editing it
 * from a task's row would silently rewrite every sibling under that area.
 *
 * Exists so Category is an ordinary column — showable, sortable, filterable, reachable from
 * the advanced filter and the search box — rather than a grouping dimension with no visible
 * value behind it. Off by default in every preset; add it from Show Fields.
 */
export function categoryColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "category",
    label: "Category",
    width: "8rem",
    filterKind: "enum",
    filterValue: (row) => row.node.effectiveCategory,
    sortValue: (row) => row.node.effectiveCategory,
    // Already the outermost grouping on most views; a chip repeating it on every phone row
    // spends a slot on something the section header above it already says.
    compact: "hidden",
    render: (row) => <ReadOnlyCell value={row.node.effectiveCategory ?? ""} />,
  };
}

export function percentColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "percent",
    label: "%",
    width: "3rem",
    align: "right",
    sortValue: (row) => row.node.percentCompleteRollup,
    // 0% on every untouched row would be noise; only progress is worth a chip.
    compactText: (row) =>
      row.node.percentCompleteRollup > 0 ? `${row.node.percentCompleteRollup}%` : null,
    render: (row) => <PercentCell node={row.node} />,
  };
}

/** Full-label State, alongside the narrow `abbrStateColumn` when a view needs both. */
export function stateColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "state",
    label: "State",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => STATE_LABELS[row.node.state],
    sortValue: (row) => row.node.state,
    render: (row, ctx) => (
      <StateCell
        node={row.node}
        onChange={(state) => ctx.onStateChange(row.node, state)}
      />
    ),
  };
}

/** A checked completion flag is a scan aid; State remains the editable source of truth. */
export function completedColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "completed",
    label: "Completed",
    width: "5.5rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) =>
      row.node.state === "completed" ? "Completed" : "Not completed",
    sortValue: (row) => (row.node.state === "completed" ? 1 : 0),
    compact: "hidden",
    render: (row) => (
      <ReadOnlyCell value={row.node.state === "completed" ? "✓" : ""} align="center" />
    ),
  };
}

/** General boolean fields stay explicit in filters even when an unchecked cell is blank. */
function booleanColumn(
  id: string,
  label: string,
  value: (node: OutlineNode) => boolean | null,
): ColumnDef<OutlineColumnCtx> {
  return {
    id,
    label,
    width: "5.5rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) => {
      const current = value(row.node);
      return current === null ? null : current ? "Yes" : "No";
    },
    sortValue: (row) => {
      const current = value(row.node);
      return current === null ? null : current ? 1 : 0;
    },
    compact: "hidden",
    render: (row) => (
      <ReadOnlyCell value={value(row.node) ? "Yes" : "No"} align="center" />
    ),
  };
}

export function effortDrivenColumn(): ColumnDef<OutlineColumnCtx> {
  return booleanColumn("effortDriven", "Effort driven", (node) => node.effortDriven);
}

/** Focus is the one boolean that stays directly editable from every node grid. */
export function focusColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "focus",
    label: "Focus",
    width: "3.5rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) => (row.node.focus ? "Yes" : "No"),
    sortValue: (row) => (row.node.focus ? 1 : 0),
    render: (row, ctx) => (
      <FocusCell
        node={row.node}
        onChange={(focus) => ctx.onFocusChange(row.node, focus)}
      />
    ),
  };
}

function calendarDateColumn(
  id: string,
  label: string,
  value: (node: OutlineNode) => Date | null,
): ColumnDef<OutlineColumnCtx> {
  return {
    id,
    label,
    width: "7.5rem",
    align: "right",
    filterKind: "date",
    filterValue: (row) => {
      const date = value(row.node);
      return date ? toDateKey(date) : null;
    },
    sortValue: (row) => {
      const date = value(row.node);
      return date ? toDateKey(date) : null;
    },
    compact: "hidden",
    render: (row) => {
      const date = value(row.node);
      return <ReadOnlyCell value={date ? toDateKey(date) : ""} align="right" />;
    },
  };
}

function instantDateColumn(
  id: string,
  label: string,
  value: (node: OutlineNode) => Date | null,
): ColumnDef<OutlineColumnCtx> {
  return {
    id,
    label,
    width: "7.5rem",
    align: "right",
    filterKind: "date",
    filterValue: (row) => {
      const date = value(row.node);
      return date ? localDateKey(date) : null;
    },
    sortValue: (row) => value(row.node)?.getTime() ?? null,
    compact: "hidden",
    render: (row) => {
      const date = value(row.node);
      return <ReadOnlyCell value={date ? localDateKey(date) : ""} align="right" />;
    },
  };
}

export function actualStartColumn(): ColumnDef<OutlineColumnCtx> {
  return calendarDateColumn(
    "actualStart",
    "Actual start",
    (node) => node.actualStartDate,
  );
}

export function dateCompletedColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "dateCompleted",
    label: "Completed on",
    width: "7.5rem",
    align: "right",
    filterKind: "date",
    filterValue: (row) => completedDateKey(row.node),
    sortValue: (row) => row.node.dateCompleted?.getTime() ?? null,
    compact: "hidden",
    render: (row) => (
      <ReadOnlyCell value={completedDateKey(row.node) ?? ""} align="right" />
    ),
  };
}

function completedDateKey(node: OutlineNode): string | null {
  if (!node.dateCompleted) return null;
  // Task `date_completed` is a calendar field; other types only have a true completion
  // instant, which belongs to the user's local day rather than its UTC date.
  return node.type === "task"
    ? toDateKey(node.dateCompleted)
    : localDateKey(node.dateCompleted);
}

export function dateCreatedColumn(): ColumnDef<OutlineColumnCtx> {
  return instantDateColumn("dateCreated", "Created", (node) => node.createdAt);
}

export function dateModifiedColumn(): ColumnDef<OutlineColumnCtx> {
  return instantDateColumn("dateModified", "Modified", (node) => node.updatedAt);
}

export function deferToColumn(): ColumnDef<OutlineColumnCtx> {
  return calendarDateColumn("deferTo", "Defer to", (node) => node.deferredDate);
}

export function targetStartColumn(): ColumnDef<OutlineColumnCtx> {
  return calendarDateColumn("targetStart", "Start", (node) => node.targetStart);
}

export function targetEndColumn(): ColumnDef<OutlineColumnCtx> {
  return calendarDateColumn("targetEnd", "End", (node) => node.targetEnd);
}

function textColumn(
  id: string,
  label: string,
  value: (node: OutlineNode) => string,
  width = "minmax(10rem,1fr)",
): ColumnDef<OutlineColumnCtx> {
  return {
    id,
    label,
    width,
    filterKind: "text",
    filterValue: (row) => value(row.node) || null,
    sortValue: (row) => value(row.node).toLocaleLowerCase() || null,
    compact: "hidden",
    render: (row) => <ReadOnlyCell value={value(row.node)} />,
  };
}

export function contextsColumn(): ColumnDef<OutlineColumnCtx> {
  return textColumn(
    "contexts",
    "Contexts",
    (node) => node.contexts?.join(", ") ?? "",
    "9rem",
  );
}

export function descriptionColumn(): ColumnDef<OutlineColumnCtx> {
  return textColumn("description", "Description", (node) => node.description);
}

export function placeColumn(): ColumnDef<OutlineColumnCtx> {
  return textColumn("place", "Place", (node) => node.place, "8rem");
}

export function assigneeColumn(): ColumnDef<OutlineColumnCtx> {
  return textColumn("assignedTo", "Assignee(s)", (node) => node.assignedTo, "9rem");
}

export function purposeColumn(): ColumnDef<OutlineColumnCtx> {
  return textColumn("purpose", "Purpose", (node) => node.purpose);
}

export function resultAreaNameColumn(): ColumnDef<OutlineColumnCtx> {
  return textColumn(
    "resultAreaName",
    "Result Area",
    (node) => node.resultAreaName ?? "",
  );
}

export function effortColumn(
  id: "actualEffort" | "effortLeft" | "leadTime" | "deadlineLeadTime",
  label: string,
  value: (node: OutlineNode) => number | null,
): ColumnDef<OutlineColumnCtx> {
  return {
    id,
    label,
    width: "5.5rem",
    align: "right",
    filterKind: "text",
    filterValue: (row) => formatEffort(value(row.node)) || null,
    sortValue: (row) => value(row.node) ?? null,
    compact: "hidden",
    render: (row) => (
      <ReadOnlyCell value={formatEffort(value(row.node))} align="right" />
    ),
  };
}

export function actualEffortColumn(): ColumnDef<OutlineColumnCtx> {
  return effortColumn(
    "actualEffort",
    "Actual effort",
    (node) => node.actualEffortRollupMinutes,
  );
}

export function effortLeftColumn(): ColumnDef<OutlineColumnCtx> {
  return effortColumn(
    "effortLeft",
    "Effort left",
    (node) => node.effortLeftRollupMinutes,
  );
}

export function leadTimeColumn(): ColumnDef<OutlineColumnCtx> {
  return effortColumn("leadTime", "Lead time", (node) => node.leadTimeMinutes);
}

export function deadlineLeadTimeColumn(): ColumnDef<OutlineColumnCtx> {
  return effortColumn(
    "deadlineLeadTime",
    "Deadline lead",
    (node) => node.deadlineLeadTimeMinutes,
  );
}

export function costColumn(
  id: "expectedCost" | "costLow" | "costHigh" | "costToDate",
  label: string,
  value: (node: OutlineNode) => number | null,
): ColumnDef<OutlineColumnCtx> {
  return {
    id,
    label,
    width: "6.5rem",
    align: "right",
    filterKind: "text",
    filterValue: (row) => formatMoney(value(row.node)) || null,
    sortValue: (row) => value(row.node),
    compact: "hidden",
    render: (row) => (
      <ReadOnlyCell value={formatMoney(value(row.node))} align="right" />
    ),
  };
}

export function importanceColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "importance",
    label: "Importance",
    width: "5rem",
    align: "right",
    filterKind: "text",
    filterValue: (row) =>
      row.node.importance === null ? null : String(row.node.importance),
    sortValue: (row) => row.node.importance,
    compact: "hidden",
    render: (row) => (
      <ReadOnlyCell
        value={row.node.importance === null ? "" : String(row.node.importance)}
        align="right"
      />
    ),
  };
}

export function iconColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "icon",
    label: "Icon",
    width: "3rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) => kindOfNode(row.node),
    sortValue: (row) => kindOfNode(row.node),
    compact: "hidden",
    render: (row) => (
      <span className="flex justify-center">
        <TypeIcon kind={kindOfNode(row.node)} className="h-3.5 w-3.5" />
      </span>
    ),
  };
}

export function projectPriorityColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "projectPriority",
    label: "Project Pri",
    width: "5.5rem",
    align: "center",
    filterKind: "priority",
    filterValue: (row) =>
      formatPriority(row.node.projectPriorityLetter, row.node.projectPriorityRank) ||
      null,
    sortValue: (row) =>
      row.node.projectPriorityLetter
        ? encodePriority({
            letter: row.node.projectPriorityLetter,
            rank: row.node.projectPriorityRank,
          })
        : null,
    compact: "hidden",
    render: (row) => (
      <ReadOnlyCell
        value={formatPriority(
          row.node.projectPriorityLetter,
          row.node.projectPriorityRank,
        )}
        align="center"
      />
    ),
  };
}

export function lapColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "lap",
    label: "L.A.P.",
    width: "3.5rem",
    align: "center",
    filterKind: "priority",
    filterValue: (row) => formatPriority(row.node.lapLetter, row.node.lapRank) || null,
    sortValue: (row) =>
      row.node.lapLetter
        ? encodePriority({ letter: row.node.lapLetter, rank: row.node.lapRank })
        : null,
    compact: "hidden",
    render: (row) => (
      <ReadOnlyCell
        value={formatPriority(row.node.lapLetter, row.node.lapRank)}
        align="center"
      />
    ),
  };
}

export function scheduleStatusColumn(
  statuses: ReadonlyMap<string, ScheduleStatus>,
  today: string | null,
): ColumnDef<OutlineColumnCtx> {
  const statusFor = (node: OutlineNode) =>
    statuses.get(node.id) ?? scheduleStatusForNode(node, today);

  return {
    id: "status",
    label: "Status",
    width: "7.5rem",
    filterKind: "enum",
    filterValue: (row) => STATUS_LABELS[statusFor(row.node)],
    sortValue: (row) => statusFor(row.node),
    compact: "hidden",
    render: (row, ctx) => (
      <StatusCell node={row.node} today={ctx.today} status={statusFor(row.node)} />
    ),
  };
}

/**
 * The name cell, with inline rename and the expander.
 *
 * Indent comes from `row.depth`. On the Outline that is full tree depth. On Projects and
 * Tasks, `sliceTree` re-bases it onto kept ancestors only — so a project under a filtered-
 * out goal sits at 0, and only real subprojects / subtasks indent. The Chooser passes
 * `flat: true` because its ranking is cross-project and must not imply nesting.
 */
export function nameColumn(
  options: { width?: string; flat?: boolean; dragHandle?: boolean } = {},
): ColumnDef<OutlineColumnCtx> {
  const { width = "minmax(14rem,1.4fr)", flat = false, dragHandle = false } = options;

  return {
    id: "name",
    label: "Name",
    width,
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name,
    sortValue: (row) => row.node.name.toLowerCase(),
    render: (row, ctx) => (
      <NameCell
        node={row.node}
        depth={flat ? 0 : row.depth}
        selected={row.node.id === ctx.selectedId}
        editing={row.node.id === ctx.editingId}
        dragHandle={dragHandle}
        onToggleCollapsed={() => ctx.onToggleCollapsed(row.node)}
        onOpenDetail={() => ctx.onOpenDetail(row.node)}
        onFinishEdit={(name) => ctx.onFinishEdit(row.node, name)}
        onCancelEdit={ctx.onCancelEdit}
      />
    ),
  };
}
