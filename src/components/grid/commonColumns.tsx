"use client";

import type { NodeState, NodeType, PriorityLetter } from "@/db/schema";
import { DateText } from "@/components/date/DateText";
import { priorityOrderValue } from "@/lib/priority/order";
import { localDateKey, toDateKey } from "@/lib/schedule/geometry";
import type { OutlineNode } from "@/lib/tree/types";
import { formatEffort, formatMoney, formatPriority } from "@/lib/tree/format";
import {
  kindOfNode,
  KIND_LABELS,
  NODE_KINDS,
  STATE_CODES,
  STATE_LABELS,
  stateRank,
  type NodeKind,
} from "@/lib/tree/hierarchy";
import {
  scheduleStatusForNode,
  STATUS_LABELS,
  type ScheduleStatus,
} from "@/lib/tree/status";
import { displayPercentComplete } from "@/lib/tree/percent";
import { ownEffectiveState } from "@/lib/tree/shelving";
import { TypeIcon } from "@/components/icons/TypeIcon";
import type { ColumnDef } from "./columns";
import {
  AbbrStateCell,
  DeadlineCell,
  FocusCell,
  NameCell,
  PercentCell,
  ReadOnlyCell,
  StateCell,
  StatusCell,
} from "./cells";
import { LetterRankCell } from "@/components/grid/LetterRankCell";

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
  /**
   * @deprecated Prefer `useRowSelected()` — kept optional so older column renders that
   * still compare against it keep compiling during the selection-context migration.
   */
  selectedId?: string | null;
  editingId: string | null;
  onToggleCollapsed: (node: OutlineNode) => void;
  onOpenDetail: (node: OutlineNode) => void;
  onFinishEdit: (node: OutlineNode, name: string) => void;
  /** Escape passes the uncommitted draft so a virgin empty insert can be discarded. */
  onCancelEdit: (draft: string) => void;
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

/**
 * ABCD priority with its rank — `A1`, or blank.
 *
 * Edited through `LetterRankCell`, the same cell the Task Chooser and the Day list use,
 * because outline priority is now the same kind of thing they are: a hand-maintained
 * ranking where a letter always resolves to a position. What you type is a request the
 * ranking engine answers, and the cell shows the rank you actually got.
 */
export function priorityColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "priority",
    label: "Pri",
    width: "3rem",
    align: "center",
    filterKind: "priority",
    filterValue: (row) =>
      formatPriority(row.node.priorityLetter, row.node.priorityRank) || null,
    // A1 < A2 < A10 < B1, and blank sorts last (null) — see `lib/priority/order`.
    sortValue: (row) =>
      priorityOrderValue(row.node.priorityLetter, row.node.priorityRank),
    render: (row, ctx) => (
      <LetterRankCell
        letter={row.node.priorityLetter}
        rank={row.node.priorityRank}
        onAssign={(letter, rank) => ctx.onPriorityChange(row.node, letter, rank)}
        ariaLabel="Priority — A, B, C or D with a rank"
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
    // CompactRow formats this canonical filter value through the user's display preference.
    render: (row, ctx) => (
      <DeadlineCell
        node={row.node}
        today={ctx.today}
        onChange={(deadline) => ctx.onDeadlineChange(row.node, deadline)}
      />
    ),
  };
}

/**
 * Achieve's two-letter State code — `NS`, `IP`, `C`. Heads "State" like its wide twin;
 * only Show Fields and the filter builder call it "Abbreviated State", where the two have
 * to be told apart.
 */
export function abbrStateColumn(today: string | null): ColumnDef<OutlineColumnCtx> {
  const stateOf = (node: OutlineNode) => ownEffectiveState(node, today);

  return {
    id: "abbrState",
    label: "State",
    fieldLabel: "Abbreviated State",
    // Wide enough for the "State" header to render unabbreviated — a column headed "Sta…"
    // cannot do the disambiguating the shared header name relies on.
    width: "4.25rem",
    align: "center",
    filterKind: "enum",
    // Filters on the code, because that is what the cell shows and what stored filters
    // already match on; the set filter spells it out via `filterLabel`.
    filterValue: (row) => {
      const state = stateOf(row.node);
      return state === null ? null : STATE_CODES[state];
    },
    filterLabel: (code) => STATE_LABEL_BY_CODE[code] ?? code,
    // Workflow order (Not started → … → Proposed), not alphabetical on the enum key.
    sortValue: (row) => {
      const state = stateOf(row.node);
      return state === null ? null : stateRank(state);
    },
    render: (row, ctx) => {
      const state = stateOf(row.node);
      return state === null ? (
        <ReadOnlyCell value="" />
      ) : (
        <AbbrStateCell
          state={state}
          onChange={(next) => ctx.onStateChange(row.node, next)}
        />
      );
    },
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
    // Match PercentCell: leaf own %, parent effort-weighted rollup. The rollup alone
    // is 0 for any leaf without an effort estimate, which is most tasks.
    sortValue: (row) => displayPercentComplete(row.node),
    // 0% on every untouched row would be noise; only progress is worth a chip.
    compactText: (row) => {
      const value = displayPercentComplete(row.node);
      return value > 0 ? `${value}%` : null;
    },
    render: (row) => <PercentCell node={row.node} />,
  };
}

/** Full-label State, alongside the narrow `abbrStateColumn` when a view needs both. */
export function stateColumn(today: string | null): ColumnDef<OutlineColumnCtx> {
  const stateOf = (node: OutlineNode) => ownEffectiveState(node, today);

  return {
    id: "state",
    label: "State",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => {
      const state = stateOf(row.node);
      return state === null ? null : STATE_LABELS[state];
    },
    // Same rank as the abbreviated twin and as group-by-State — a state column is a
    // workflow, not a glossary.
    sortValue: (row) => {
      const state = stateOf(row.node);
      return state === null ? null : stateRank(state);
    },
    render: (row, ctx) => {
      const state = stateOf(row.node);
      return state === null ? (
        <ReadOnlyCell value="" />
      ) : (
        <StateCell
          state={state}
          onChange={(next) => ctx.onStateChange(row.node, next)}
        />
      );
    },
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
      row.node.state === null
        ? null
        : row.node.state === "completed"
          ? "Completed"
          : "Not completed",
    sortValue: (row) =>
      row.node.state === null ? null : row.node.state === "completed" ? 1 : 0,
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
      return (
        <DateText
          dateKey={date ? toDateKey(date) : null}
          className="text-right text-[0.75rem] text-ink-muted"
        />
      );
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
      return (
        <DateText
          dateKey={date ? localDateKey(date) : null}
          className="text-right text-[0.75rem] text-ink-muted"
        />
      );
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
    sortValue: (row) => completedDateKey(row.node),
    compact: "hidden",
    render: (row) => (
      <DateText
        dateKey={completedDateKey(row.node)}
        className="text-right text-[0.75rem] text-ink-muted"
      />
    ),
  };
}

function completedDateKey(node: OutlineNode): string | null {
  if (node.state === null) return null;
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
    filterKind: "number",
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
    filterKind: "number",
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

/**
 * Achieve's Icon column: the type glyph in a column of its own.
 *
 * **Showing it moves the glyph out of the Name cell** rather than drawing a second one —
 * see `data-grid.md`. That is what makes this column a *placement choice* instead of a
 * duplicate: Achieve puts the icon here and leaves plain names in the tree, we default to
 * the icon beside the name, and this column swaps between the two.
 *
 * Reach for `typeColumn()` instead when what you want is to filter or group by type — it
 * says the word and leaves the glyph where it is.
 */
export function iconColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "icon",
    label: "Icon",
    // Two columns carry the same value, so the field list has to say which rendering is
    // which. Side by side they read as a pair: "Type icon" / "Type name".
    fieldLabel: "Type icon",
    width: "3rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) => kindOfNode(row.node),
    filterLabel: kindLabel,
    sortValue: (row) => kindRank(row.node),
    compact: "hidden",
    render: (row) => (
      <span className="flex justify-center">
        <TypeIcon kind={kindOfNode(row.node)} className="h-3.5 w-3.5" />
      </span>
    ),
  };
}

/**
 * The row's kind as a word — Result Area, Goal, Dream, Project, Task.
 *
 * The readable half of the Icon column, and the one to add when the point is to *filter* by
 * type: it never competes with the glyph beside the name, so both can be on screen at once.
 * Dream reads as its own type here, as it does everywhere else in the UI, even though the
 * database stores it as a goal.
 *
 * Sorts in hierarchy order rather than alphabetically. Alphabetical would file a Task above
 * a Result Area, which is exactly backwards for a column whose whole subject is the levels
 * of the tree.
 */
export function typeColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "type",
    label: "Type",
    fieldLabel: "Type name",
    width: "5.5rem",
    filterKind: "enum",
    filterValue: (row) => kindOfNode(row.node),
    filterLabel: kindLabel,
    sortValue: (row) => kindRank(row.node),
    compact: "hidden",
    compactText: (row) => KIND_LABELS[kindOfNode(row.node)],
    render: (row) => <ReadOnlyCell value={KIND_LABELS[kindOfNode(row.node)]} />,
  };
}

/** Stored kinds are enum values (`result_area`); nobody picks one of those off a list. */
function kindLabel(value: string): string {
  return KIND_LABELS[value as NodeKind] ?? value;
}

/** Broadest first, so sorting by type walks down the tree's levels. */
function kindRank(node: { type: NodeType; isDream?: boolean }): number {
  return NODE_KINDS.indexOf(kindOfNode(node));
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
      priorityOrderValue(row.node.projectPriorityLetter, row.node.projectPriorityRank),
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
    sortValue: (row) => priorityOrderValue(row.node.lapLetter, row.node.lapRank),
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
  const statusFor = (node: OutlineNode): ScheduleStatus | null => {
    if (node.state === null) return null;
    return statuses.get(node.id) ?? scheduleStatusForNode(node, today);
  };

  return {
    id: "status",
    label: "Status",
    width: "7.5rem",
    filterKind: "enum",
    filterValue: (row) => {
      const status = statusFor(row.node);
      return status === null ? null : STATUS_LABELS[status];
    },
    sortValue: (row) => statusFor(row.node),
    compact: "hidden",
    render: (row, ctx) => {
      const status = statusFor(row.node);
      return status === null ? (
        <ReadOnlyCell value="" />
      ) : (
        <StatusCell node={row.node} today={ctx.today} status={status} />
      );
    },
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
        // Undefined on the Outline, where the tree *is* the row set.
        branch={row.branch}
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
