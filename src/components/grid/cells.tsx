"use client";

import { useContext, useEffect, useRef, useState } from "react";
import type { NodeState, PriorityLetter } from "@/db/schema";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { formatFullDateKey } from "@/lib/dateFormat";
import type { OutlineNode } from "@/lib/tree/types";
import {
  formatEffort,
  formatPriority,
  parseEffort,
  parsePriority,
} from "@/lib/tree/format";
import { displayPercentComplete } from "@/lib/tree/percent";
import {
  KIND_LABELS,
  kindOfNode,
  STATE_CODES,
  STATE_LABELS,
  STATE_OPTIONS,
} from "@/lib/tree/hierarchy";
import { toDateKey } from "@/lib/schedule/geometry";
import { scheduleStatus, STATUS_LABELS, type ScheduleStatus } from "@/lib/tree/status";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { NameIconContext } from "./nameIconContext";
import { RowDragHandleContext } from "./rowDragContext";
import { useRowSelected } from "./rowSelectedContext";

const PRIORITY_COLOR: Record<PriorityLetter, string> = {
  A: "text-priority-a",
  B: "text-priority-b",
  C: "text-priority-c",
  D: "text-priority-d",
};

/**
 * Type is carried by typography as well as by the glyph: result areas are set in small
 * caps, and each level below sits a little quieter than the one above.
 */
const TYPE_STYLE: Record<OutlineNode["type"], string> = {
  result_area: "text-[0.8125rem] font-semibold uppercase tracking-[0.08em]",
  goal: "text-[0.875rem] font-semibold",
  project: "text-[0.875rem] font-medium",
  task: "text-[0.875rem] font-normal",
};

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

/**
 * Name cell: indent rails, expander, type icon, label (or inline editor).
 *
 * `depth` is supplied by the host: full tree depth on the Outline, re-based list depth on
 * Projects / Tasks (only kept same-type ancestors). One rail per level; top-level rows
 * get none.
 */
export function NameCell({
  node,
  depth,
  editing,
  branch,
  onToggleCollapsed,
  onOpenDetail,
  onFinishEdit,
  onCancelEdit,
  /**
   * When true, the type icon is a second drag handle next to the left gutter. It becomes
   * `draggable` only while the surrounding row is accepting drag (see
   * `RowDragHandleContext`) — e.g. not while a header sort has stood drag down.
   */
  dragHandle = false,
}: {
  node: OutlineNode;
  depth: number;
  editing: boolean;
  /**
   * Children in *this* row set, when that differs from the tree — see `GridRow.branch`.
   * Omitted on the Outline, where the node's own counts are the answer.
   */
  branch?: { hasChildren: boolean; childCount: number };
  onToggleCollapsed: () => void;
  onOpenDetail: () => void;
  onFinishEdit: (name: string) => void;
  /** Escape passes the uncommitted draft so a virgin empty insert can be discarded. */
  onCancelEdit: (draft: string) => void;
  dragHandle?: boolean;
}) {
  const selected = useRowSelected();
  const done = node.state === "completed" || node.state === "cancelled";
  const hasChildren = branch?.hasChildren ?? node.hasChildren;
  const childCount = branch?.childCount ?? node.childCount;
  // A dream is typographically a goal — it differs only in its glyph and what it is called.
  const kind = kindOfNode(node);
  // Permanently draggable while the row wants drag: arming on mousedown is too late for
  // HTML5 DnD and the browser falls through to selecting the name text instead.
  const dragApi = useContext(RowDragHandleContext);
  // False while the optional `icon` column is on screen, which is where the glyph goes
  // instead — see `NameIconContext`. The row gutter is still a drag handle either way.
  const showIcon = useContext(NameIconContext);
  const iconIsHandle = Boolean(dragHandle && dragApi && showIcon);

  return (
    <div className="flex min-w-0 items-stretch self-stretch">
      {Array.from({ length: depth }, (_, level) => (
        <span key={level} aria-hidden className="spine" />
      ))}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapsed();
        }}
        aria-label={node.collapsed ? "Expand" : "Collapse"}
        tabIndex={-1}
        className={[
          // Layout width stays `w-4` so the name gutter and compact meta-line padding stay
          // aligned (`--name-gutter`). Below `md`, a centred 44px `::before` grows the hit
          // area without the glyph or the row density (`responsive.md`). Compact rows are
          // already `min-h-tap`, so adjacent cards meet at the edge rather than overlap.
          // Leaf rows keep the gutter for alignment but do not steal taps.
          "relative mr-1 ml-0.5 flex w-4 flex-none items-center justify-center text-[0.625rem] text-ink-faint",
          hasChildren
            ? "hover:text-ink before:absolute before:top-1/2 before:left-1/2 before:h-tap before:w-tap before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] md:before:hidden"
            : "pointer-events-none invisible",
        ].join(" ")}
      >
        {node.collapsed ? "▶" : "▼"}
      </button>

      {!showIcon ? null : dragHandle ? (
        <span
          data-drag-handle
          draggable={iconIsHandle || undefined}
          title={iconIsHandle ? "Drag to reorder" : undefined}
          onMouseDown={
            iconIsHandle && dragApi
              ? (event) => {
                  if (event.button !== 0) return;
                  if (event.shiftKey || event.metaKey || event.ctrlKey) return;
                  dragApi.onHandleMouseDown();
                }
              : undefined
          }
          onDragStart={
            iconIsHandle && dragApi ? (event) => dragApi.onDragStart(event) : undefined
          }
          className={[
            "mr-1.5 flex flex-none select-none items-center self-center",
            iconIsHandle ? "cursor-grab active:cursor-grabbing" : "",
          ].join(" ")}
        >
          {/* pointer-events-none so the span is unambiguously the drag source, not the SVG. */}
          <TypeIcon
            kind={kind}
            className={`pointer-events-none h-3.5 w-3.5 ${done ? "opacity-45" : ""}`}
          />
        </span>
      ) : (
        <TypeIcon
          kind={kind}
          className={`mr-1.5 h-3.5 w-3.5 flex-none self-center ${done ? "opacity-45" : ""}`}
        />
      )}

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
          {node.name || `New ${KIND_LABELS[kind].toLowerCase()}`}
        </span>
      )}

      {/* Without this a repeating row is unreadable on the Outline, which has no Status
          column: ticking one un-ticks it a moment later and moves dates you cannot see,
          which looks like the app refusing the click rather than like a cycle. */}
      {node.recurrenceFrequency !== "none" && (
        <span
          aria-label="Repeats"
          title="Repeats — completing it starts the next occurrence"
          className="ml-1.5 flex-none self-center text-[0.6875rem] text-ink-faint"
        >
          ↻
        </span>
      )}

      {node.collapsed && hasChildren && (
        <span className="tabular ml-2 flex-none self-center text-[0.6875rem] text-ink-faint">
          {childCount}
        </span>
      )}

      {selected && !editing && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail();
          }}
          aria-label={`Open ${KIND_LABELS[kind].toLowerCase()}`}
          title="Open record (Enter)"
          tabIndex={-1}
          className="ml-2 flex-none self-center rounded px-1 text-[0.6875rem] leading-none text-ink-muted hover:bg-surface hover:text-ink"
        >
          ⤢
        </button>
      )}
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
  onCancel: (draft: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Escape unmounts this input; blur can still fire and would re-commit the draft. Guard so
  // cancel (including discard of a virgin empty insert) is the only outcome.
  const cancelledRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (cancelledRef.current) return;
        onCommit(value.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(value.trim());
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelledRef.current = true;
          onCancel(value);
        }
      }}
      className="min-w-0 flex-1 self-center rounded-sm border border-select-edge bg-surface px-1 text-[0.875rem] text-ink outline-none"
    />
  );
}

// ---------------------------------------------------------------------------
// Priority / Effort / Deadline
// ---------------------------------------------------------------------------

/**
 * Priority is typed the way Achieve writes it — "A1", "A", empty to clear. Typing beats a
 * dropdown when there are 40-odd values. Unparseable input reverts and flags.
 */
export function PriorityCell({
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
 * Effort is typed Achieve-style ("2 h", "45 min"). Only a leaf task is editable; a parent
 * shows the rollup total read-only.
 */
export function EffortCell({
  node,
  onChange,
  /** When set, shows this value instead of the node's own estimate (e.g. effort left). */
  field = "effort",
}: {
  node: OutlineNode;
  onChange: (minutes: number | null) => void;
  field?: "effort" | "effortLeft";
}) {
  const editable = node.type === "task" && !node.hasChildren && field === "effort";
  const stored = field === "effortLeft" ? node.effortLeftMinutes : node.effortMinutes;
  const rollup =
    field === "effortLeft" ? node.effortLeftRollupMinutes : node.effortRollupMinutes;
  const current = formatEffort(stored);
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);

  if (!editable) {
    return (
      <span
        className="tabular text-right text-[0.75rem] text-ink-muted"
        title={node.hasChildren ? "Total of everything below" : undefined}
      >
        {formatEffort(field === "effort" ? rollup : stored)}
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

export function DeadlineCell({
  node,
  today,
  onChange,
}: {
  node: OutlineNode;
  today: string | null;
  onChange: (deadline: string | null) => void;
}) {
  const formatDate = useDateFormatter();
  const value = node.deadline ? toDateKey(node.deadline) : "";
  const overdue =
    value !== "" && today !== null && value < today && node.state !== "completed";

  return (
    <span className="relative block w-full">
      <input
        type="date"
        value={value}
        onClick={(event) => {
          event.stopPropagation();
          event.currentTarget.showPicker();
        }}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label="Deadline"
        className={[
          "peer tabular w-full border-none bg-transparent text-right text-[0.75rem] outline-none",
          overdue ? "text-priority-a" : "text-ink-muted",
          // A set date reads like every other grid date until the native editor has focus.
          value
            ? "opacity-0 focus:opacity-100"
            : "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-datetime-edit]:opacity-0 hover:[&::-webkit-calendar-picker-indicator]:opacity-40 hover:[&::-webkit-datetime-edit]:opacity-40 focus:[&::-webkit-calendar-picker-indicator]:opacity-100 focus:[&::-webkit-datetime-edit]:opacity-100",
        ].join(" ")}
      />
      {value ? (
        <span
          title={formatFullDateKey(value)}
          className={`pointer-events-none absolute inset-0 flex min-w-0 items-center justify-end tabular text-[0.75rem] peer-focus:hidden ${
            overdue ? "text-priority-a" : "text-ink-muted"
          }`}
        >
          <span className="min-w-0 truncate">{formatDate(value)}</span>
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// State variants
// ---------------------------------------------------------------------------

/**
 * Full-label state dropdown — the outline column and the Goals tab's "Status".
 *
 * `state` is the row's *own effective* state (`ownEffectiveState`), not the stored one: a
 * shelf whose deferred date has passed has to read Not started here as it does everywhere
 * else, or the routine that expired overnight goes on claiming to be Postponed.
 */
export function StateCell({
  state,
  onChange,
}: {
  state: NodeState;
  onChange: (state: NodeState) => void;
}) {
  return (
    <select
      value={state}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value as NodeState)}
      aria-label={`State: ${STATE_LABELS[state]}`}
      className="w-full cursor-pointer truncate border-none bg-transparent text-[0.75rem] text-ink-muted focus:text-ink"
    >
      {STATE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Narrow twin of `StateCell` for the Abbreviated State column — same write path, the
 * two-letter code in the cell.
 *
 * A native `<select>` shows the selected option's own text, so a cell that reads `NS` and
 * a list that reads `Not Started` cannot be the same string. Pairing them (`NS — Not
 * Started`) is the worst of both: as long as the full label, and no clearer. So the code
 * is drawn as text and the select sits transparent on top of it, carrying full labels for
 * the dropdown and for screen readers.
 */
export function AbbrStateCell({
  state,
  onChange,
}: {
  state: NodeState;
  onChange: (state: NodeState) => void;
}) {
  return (
    <span className="relative block w-full">
      <select
        value={state}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value as NodeState)}
        aria-label={`State: ${STATE_LABELS[state]}`}
        className="peer absolute inset-0 h-full w-full cursor-pointer border-none bg-transparent text-[0.75rem] opacity-0"
      >
        {STATE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none block truncate text-center text-[0.75rem] font-medium text-ink-muted peer-focus:text-ink"
      >
        {STATE_CODES[state]}
      </span>
    </span>
  );
}

export function FocusCell({
  node,
  onChange,
}: {
  node: OutlineNode;
  onChange: (focus: boolean) => void;
}) {
  return (
    <span className="flex justify-center">
      <input
        type="checkbox"
        checked={node.focus}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.checked)}
        aria-label="Focus"
        className="h-3.5 w-3.5 accent-[var(--select-edge)]"
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Read-only / simple cells used by the Projects and Tasks tabs
// ---------------------------------------------------------------------------

/** Derived schedule status — never editable. */
export function StatusCell({
  node,
  today,
  status,
}: {
  node: OutlineNode;
  today: string | null;
  /** Precomputed (e.g. with child→parent propagation). Defaults to local status. */
  status?: ScheduleStatus | null;
}) {
  if (node.state === null || status === null) {
    return <span className="truncate text-[0.75rem] text-ink-muted" />;
  }
  const resolved =
    status ??
    scheduleStatus({
      deadline: node.deadline,
      targetStart: node.targetStart,
      targetEnd: node.targetEnd,
      state: node.state,
      shelf: node.shelf,
      priorityLetter: node.priorityLetter,
      today,
    });
  return (
    <span className="truncate text-[0.75rem] text-ink-muted">
      {STATUS_LABELS[resolved]}
    </span>
  );
}

export function PercentCell({ node }: { node: OutlineNode }) {
  const value = displayPercentComplete(node);
  return (
    <span className="tabular text-right text-[0.75rem] text-ink-muted">
      {value > 0 ? `${value}%` : ""}
    </span>
  );
}

/** Free-text inline editor — Goals Definition / Range, Wish titles, etc. */
export function TextCell({
  value,
  ariaLabel,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);

  return (
    <input
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        setInvalid(false);
        setDraft(event.target.value);
      }}
      onBlur={() => {
        const next = draft.trim();
        if (next === value) return;
        onChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      className="w-full truncate border-none bg-transparent text-[0.8125rem] text-ink outline-none"
    />
  );
}

/** Plain read-only text — purpose panels, L.A.P. display, etc. */
export function ReadOnlyCell({
  value,
  align = "left",
  title,
}: {
  value: string;
  align?: "left" | "center" | "right";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={[
        "block truncate text-[0.75rem] text-ink-muted",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "",
      ].join(" ")}
    >
      {value}
    </span>
  );
}
