"use client";

import type { NodeState, PriorityLetter } from "@/db/schema";
import { LetterRankCell } from "@/components/grid/LetterRankCell";
import type { ColumnDef } from "@/components/grid/columns";
import { STATE_LABELS, STATE_OPTIONS } from "@/lib/tree/hierarchy";
import type { DailyItemView } from "@/lib/day/types";

/**
 * Columns for a day's task list.
 *
 * Deliberately few. The whole point of the tab is that writing down what you are doing
 * today costs nothing, so the row asks for a checkbox, a priority and some words — not a
 * project, a result area or an effort estimate. The Source column is read-only and only
 * fills in for rows that came from the outline.
 */

export type DayColumnCtx = {
  onToggleComplete: (itemId: string, done: boolean) => void;
  onSetState: (itemId: string, state: NodeState) => void;
  onAssignPriority: (
    itemId: string,
    letter: PriorityLetter | null,
    rank: number | null,
  ) => void;
  onRename: (itemId: string, title: string) => void;
};

/**
 * The check box, cancelled X, or Franklin Covey's forwarded mark.
 *
 * "Done" is bound to `completedAt` rather than `state === "completed"`, because a
 * recurring task is sent back to `not_started` the instant it is completed — see the
 * schema comment on `daily_items.completed_at`. Cancelled also stamps `completedAt`, but
 * keeps `state === "cancelled"` so this cell can show an **X** instead of a tick.
 *
 * A **forwarded** row shows "→" and no box. That row is history: the live copy is on the
 * day it moved to, and a check box here would offer to complete a line that has already
 * left. Showing the mark is the whole reason forwarding writes a new row instead of moving
 * the old one — a past day should say what you meant to do and what became of it, and an
 * unfinished line is forwarded, never overdue.
 */
function CheckCell({ item, ctx }: { item: DailyItemView; ctx: DayColumnCtx }) {
  if (item.forwardedTo !== null) {
    return (
      <span
        aria-label={`Forwarded to ${item.forwardedTo}`}
        title={`Forwarded to ${item.forwardedTo}`}
        className="text-[0.8125rem] text-ink-faint"
      >
        →
      </span>
    );
  }

  // Cancelled is settled like completed, but the mark is an X — not a check and not a
  // missing box. Clicking reopens (clears cancel), same as unchecking a completed line.
  if (item.state === "cancelled") {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          ctx.onSetState(item.id, "not_started");
        }}
        aria-label="Cancelled — click to reopen"
        title="Cancelled"
        className="flex h-3.5 w-3.5 cursor-pointer items-center justify-center text-[0.75rem] font-semibold leading-none text-ink-muted hover:text-ink"
      >
        ×
      </button>
    );
  }

  const done = item.completedAt !== null;
  return (
    <input
      type="checkbox"
      checked={done}
      onClick={(event) => event.stopPropagation()}
      onChange={() => ctx.onToggleComplete(item.id, !done)}
      aria-label={done ? "Completed — click to reopen" : "Mark completed"}
      className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent,currentColor)]"
    />
  );
}

/** Free-text title. Node-backed rows show the task's live name and are not edited here. */
function TitleCell({ item, ctx }: { item: DailyItemView; ctx: DayColumnCtx }) {
  // Settled lines (completed or cancelled) share strikethrough; state alone is not enough
  // for completed, because a recurring task may already be `not_started` again.
  const settled = item.completedAt !== null || item.state === "cancelled";
  const forwarded = item.forwardedTo !== null;

  const className = [
    "w-full truncate border-none bg-transparent text-[0.8125rem] outline-none",
    settled ? "text-ink-faint line-through" : forwarded ? "text-ink-faint" : "text-ink",
  ].join(" ");

  if (item.nodeId) {
    return (
      <span className={className} title={item.title}>
        {item.title}
      </span>
    );
  }

  return (
    <input
      defaultValue={item.title}
      key={item.title}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const next = event.target.value.trim();
        if (next && next !== item.title) ctx.onRename(item.id, next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = item.title;
          event.currentTarget.blur();
        }
      }}
      aria-label="Item"
      className={className}
    />
  );
}

export const DAY_COLUMNS: ColumnDef<DayColumnCtx, DailyItemView>[] = [
  {
    id: "check",
    label: "",
    // The header is a tick box with no room for a word; every list that *names* a field —
    // Show Fields, the column menu — needs one anyway.
    fieldLabel: "Done",
    width: "2rem",
    align: "center",
    hideable: false,
    // The one column that stays a live control in a compact row. Ticking things off is the
    // reason to open this tab on a phone, and swipe-to-complete is a gesture — `responsive.md`
    // does not let a gesture be the only way to do anything.
    compact: "leading",
    render: (row, ctx) => <CheckCell item={row.node} ctx={ctx} />,
  },
  {
    id: "priority",
    label: "ABC",
    width: "3rem",
    align: "center",
    hideable: false,
    render: (row, ctx) => (
      <LetterRankCell
        letter={row.node.priorityLetter}
        rank={row.node.priorityRank}
        onAssign={(letter, rank) => ctx.onAssignPriority(row.node.id, letter, rank)}
        ariaLabel="Today's priority — A is essential, B important, C optional"
      />
    ),
    sortValue: (row) =>
      row.node.priorityLetter
        ? `${row.node.priorityLetter}${row.node.priorityRank ?? 0}`
        : "~",
    // This column has no filter to borrow text from, and without it a compact row loses both
    // its priority chip and its accent bar — the rank would only exist in the group header.
    compactText: (row) =>
      row.node.priorityLetter
        ? `${row.node.priorityLetter}${row.node.priorityRank ?? ""}`
        : null,
  },
  {
    id: "title",
    label: "Item",
    width: "minmax(14rem,1fr)",
    hideable: false,
    render: (row, ctx) => <TitleCell item={row.node} ctx={ctx} />,
    sortValue: (row) => row.node.title.toLowerCase(),
    filterKind: "text",
    filterValue: (row) => row.node.title,
  },
  {
    id: "state",
    label: "State",
    // The day list carries one State column, so it is the spelled-out one: a bare code has
    // nothing beside it to decode it, and code-plus-label is just a longer label.
    width: "7rem",
    render: (row, ctx) => (
      <select
        value={row.node.state}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) =>
          ctx.onSetState(row.node.id, event.target.value as NodeState)
        }
        aria-label={`State: ${STATE_LABELS[row.node.state]}`}
        className="w-full cursor-pointer truncate border-none bg-transparent text-[0.75rem] text-ink-muted focus:text-ink"
      >
        {STATE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    filterKind: "enum",
    filterValue: (row) => STATE_LABELS[row.node.state],
  },
  {
    id: "source",
    label: "From",
    width: "9rem",
    render: (row) => (
      <span
        className="truncate text-[0.75rem] text-ink-faint"
        title={row.node.sourceName ?? ""}
      >
        {row.node.sourceName ?? ""}
      </span>
    ),
    // The projects feeding today are a short, closed list — a checklist of them is the
    // point of the column, not an accident of the data.
    filterKind: "enum",
    filterValue: (row) => row.node.sourceName ?? "",
  },
];
