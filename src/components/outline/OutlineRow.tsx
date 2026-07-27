"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeState, PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import {
  formatEffort,
  formatPriority,
  parseEffort,
  parsePriority,
} from "@/lib/tree/format";
import { STATE_OPTIONS, TYPE_LABELS } from "@/lib/tree/hierarchy";
import { GRID_TEMPLATE } from "./OutlineGrid";

const PRIORITY_COLOR: Record<PriorityLetter, string> = {
  A: "text-priority-a",
  B: "text-priority-b",
  C: "text-priority-c",
  D: "text-priority-d",
};

/**
 * Type is carried by typography rather than an icon column: result areas are set in small
 * caps, and each level below sits a little quieter than the one above. That keeps the row
 * free for content while still reading as a hierarchy.
 */
const TYPE_STYLE: Record<OutlineNode["type"], string> = {
  result_area: "text-[0.8125rem] font-semibold uppercase tracking-[0.08em]",
  goal: "text-[0.875rem] font-semibold",
  project: "text-[0.875rem] font-medium",
  task: "text-[0.875rem] font-normal",
};

function priorityColorVar(letter: PriorityLetter | null): string {
  return letter ? `var(--priority-${letter.toLowerCase()})` : "var(--priority-none)";
}

export function OutlineRow({
  node,
  ancestorPriorities,
  selected,
  editing,
  today,
  stateLabel,
  onSelect,
  onOpenDetail,
  onFinishEdit,
  onCancelEdit,
  onToggleCollapsed,
  onPriorityChange,
  onStateChange,
  onFocusChange,
  onDeadlineChange,
  onEffortChange,
}: {
  node: OutlineNode;
  ancestorPriorities: (PriorityLetter | null)[];
  selected: boolean;
  editing: boolean;
  /** Today as YYYY-MM-DD, or null before hydration. Used to flag overdue deadlines. */
  today: string | null;
  stateLabel: string;
  onSelect: () => void;
  /**
   * Opens the detail drawer. Double-click and Enter both land here, as they do in Achieve;
   * inline rename moved to F2 and the toolbar.
   */
  onOpenDetail: () => void;
  onFinishEdit: (name: string) => void;
  onCancelEdit: () => void;
  onToggleCollapsed: () => void;
  onPriorityChange: (letter: PriorityLetter | null, rank: number | null) => void;
  onStateChange: (state: NodeState) => void;
  onFocusChange: (focus: boolean) => void;
  onDeadlineChange: (deadline: string | null) => void;
  onEffortChange: (minutes: number | null) => void;
}) {
  const done = node.state === "completed" || node.state === "cancelled";
  const rowRef = useRef<HTMLDivElement>(null);

  // Arrow-key navigation moves the selection without scrolling, so the row brings itself
  // into view. "nearest" keeps it from re-centring rows that are already visible.
  useEffect(() => {
    if (selected) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  return (
    <div
      ref={rowRef}
      role="treeitem"
      aria-level={node.depth + 1}
      aria-selected={selected}
      aria-expanded={node.hasChildren ? !node.collapsed : undefined}
      aria-label={`${TYPE_LABELS[node.type]}: ${node.name || "Untitled"}`}
      onClick={onSelect}
      onDoubleClick={onOpenDetail}
      className={[
        "grid",
        GRID_TEMPLATE,
        "items-center border-b border-rule/60 px-3 text-[0.875rem]",
        selected ? "bg-select" : "hover:bg-surface-raised/60",
      ].join(" ")}
      style={{ height: "var(--row-height)" }}
    >
      {/* Name cell: the priority spine, the expander, then the name. */}
      <div className="flex min-w-0 items-stretch self-stretch">
        {ancestorPriorities.map((letter, depth) => (
          <span
            key={depth}
            aria-hidden
            className="spine"
            style={{ color: priorityColorVar(letter) }}
          />
        ))}
        <span
          aria-hidden
          className="spine spine-own"
          style={{ color: priorityColorVar(node.priorityLetter) }}
        />

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapsed();
          }}
          aria-label={node.collapsed ? "Expand" : "Collapse"}
          tabIndex={-1}
          className={[
            "mr-1 ml-0.5 flex w-4 flex-none items-center justify-center text-[0.625rem] text-ink-faint",
            node.hasChildren ? "hover:text-ink" : "invisible",
          ].join(" ")}
        >
          {node.collapsed ? "▶" : "▼"}
        </button>

        {editing ? (
          <NameEditor
            initial={node.name}
            onCommit={onFinishEdit}
            onCancel={onCancelEdit}
          />
        ) : (
          <span
            className={[
              "min-w-0 flex-1 self-center truncate",
              TYPE_STYLE[node.type],
              done ? "text-ink-faint line-through" : "text-ink",
              node.name ? "" : "text-ink-faint italic",
            ].join(" ")}
          >
            {node.name || `New ${TYPE_LABELS[node.type].toLowerCase()}`}
          </span>
        )}

        {node.collapsed && node.hasChildren && (
          <span className="tabular ml-2 flex-none self-center text-[0.6875rem] text-ink-faint">
            {node.childCount}
          </span>
        )}

        {/*
          A visible way in, so opening a record is not a gesture you have to already know
          about. Only on the selected row — one of these per row would be noise in a grid
          this dense.
        */}
        {selected && !editing && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetail();
            }}
            aria-label={`Open ${TYPE_LABELS[node.type].toLowerCase()}`}
            title="Open record (Enter)"
            tabIndex={-1}
            className="ml-2 flex-none self-center rounded px-1 text-[0.6875rem] leading-none text-ink-muted hover:bg-surface hover:text-ink"
          >
            ⤢
          </button>
        )}
      </div>

      {/*
        Keyed on the stored value so a server-side change resets the field. The prefix
        matters: both formatters return "" for an unset value, so on a row with neither a
        priority nor an effort the two cells would otherwise be siblings sharing the key "".
      */}
      <PriorityCell
        key={`priority:${formatPriority(node.priorityLetter, node.priorityRank)}`}
        node={node}
        onChange={onPriorityChange}
      />

      <EffortCell
        key={`effort:${formatEffort(node.effortMinutes)}`}
        node={node}
        onChange={onEffortChange}
      />

      <DeadlineCell node={node} today={today} onChange={onDeadlineChange} />

      <select
        value={node.state}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onStateChange(event.target.value as NodeState)}
        aria-label={`State: ${stateLabel}`}
        className="w-full cursor-pointer truncate border-none bg-transparent text-[0.75rem] text-ink-muted focus:text-ink"
      >
        {STATE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <span className="flex justify-center">
        <input
          type="checkbox"
          checked={node.focus}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onFocusChange(event.target.checked)}
          aria-label="Focus"
          className="h-3.5 w-3.5 accent-[var(--select-edge)]"
        />
      </span>
    </div>
  );
}

function NameEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(value.trim());
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      className="min-w-0 flex-1 self-center rounded-sm border border-select-edge bg-surface px-1 text-[0.875rem] text-ink outline-none"
    />
  );
}

/**
 * Priority is typed the way Achieve writes it — "A1" for a ranked priority, "A" for an
 * unranked one, empty to clear. Typing beats a dropdown when there are 40-odd values.
 */
function PriorityCell({
  node,
  onChange,
}: {
  node: OutlineNode;
  onChange: (letter: PriorityLetter | null, rank: number | null) => void;
}) {
  const current = formatPriority(node.priorityLetter, node.priorityRank);
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const parsed = parsePriority(value);

    if (!parsed) {
      setInvalid(true);
      setValue(current);
      return;
    }

    setInvalid(false);
    onChange(parsed.letter, parsed.rank);
  }

  return (
    <input
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        // The reverted value is valid again, so stop flagging it the moment they retype.
        setInvalid(false);
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue(current);
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      aria-label="Priority — A, B, C or D, with an optional rank"
      aria-invalid={invalid}
      placeholder="—"
      maxLength={3}
      className={[
        "tabular w-full border-none bg-transparent text-center text-[0.8125rem] font-medium uppercase outline-none placeholder:text-ink-faint/50",
        invalid
          ? "text-priority-a"
          : node.priorityLetter
            ? PRIORITY_COLOR[node.priorityLetter]
            : "text-ink-faint",
      ].join(" ")}
    />
  );
}

/**
 * Effort is typed the way Achieve writes it — "2 h", "3:45 h", "45 min", "3 d" — and read
 * back by `parseEffort`, which also accepts the shorthand people actually type.
 *
 * Only a leaf task is editable. A parent shows the total of everything beneath it, so an
 * estimate of its own would have nowhere to appear.
 */
function EffortCell({
  node,
  onChange,
}: {
  node: OutlineNode;
  onChange: (minutes: number | null) => void;
}) {
  const editable = node.type === "task" && !node.hasChildren;
  const current = formatEffort(node.effortMinutes);
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);

  if (!editable) {
    return (
      <span
        className="tabular text-right text-[0.75rem] text-ink-muted"
        title={node.hasChildren ? "Total of everything below" : undefined}
      >
        {formatEffort(node.effortRollupMinutes)}
      </span>
    );
  }

  function commit() {
    const minutes = parseEffort(value);

    if (minutes === undefined) {
      setInvalid(true);
      setValue(current);
      return;
    }

    setInvalid(false);
    onChange(minutes);
  }

  return (
    <input
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        // The reverted value is valid again, so stop flagging it the moment they retype.
        setInvalid(false);
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue(current);
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      aria-label="Effort — for example 45 min, 2 h, 3:45 h, or 3 d"
      aria-invalid={invalid}
      placeholder="—"
      maxLength={8}
      className={[
        "tabular w-full border-none bg-transparent text-right text-[0.75rem] outline-none placeholder:text-ink-faint/50",
        invalid ? "text-priority-a" : "text-ink-muted",
      ].join(" ")}
    />
  );
}

function DeadlineCell({
  node,
  today,
  onChange,
}: {
  node: OutlineNode;
  today: string | null;
  onChange: (deadline: string | null) => void;
}) {
  const value = node.deadline ? node.deadline.toISOString().slice(0, 10) : "";
  const overdue =
    value !== "" && today !== null && value < today && node.state !== "completed";

  return (
    <input
      type="date"
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value || null)}
      aria-label="Deadline"
      className={[
        "tabular w-full border-none bg-transparent text-right text-[0.75rem] outline-none",
        overdue ? "text-priority-a" : "text-ink-muted",
        // Most rows have no deadline. An empty date input still renders "mm/dd/yyyy" and a
        // picker icon, which would put that on every row — so an unset field stays blank
        // until it is hovered or focused.
        value
          ? ""
          : "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-datetime-edit]:opacity-0 hover:[&::-webkit-calendar-picker-indicator]:opacity-40 hover:[&::-webkit-datetime-edit]:opacity-40 focus:[&::-webkit-calendar-picker-indicator]:opacity-100 focus:[&::-webkit-datetime-edit]:opacity-100",
      ].join(" ")}
    />
  );
}
