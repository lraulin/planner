"use client";

import { useEffect, useRef, useState } from "react";
import type { NoteFlag } from "@/db/schema";
import { GROUP_BY_LABELS, type NoteGroupBy } from "@/lib/grid/grouping";
import type { NoteNode } from "@/lib/notes/types";
import { noteDatePart, noteDatePartLabel } from "@/lib/notes/grouping";
import { noteSnippet } from "@/lib/notes/snippet";
import { toDateKey } from "@/lib/schedule/geometry";
import { TYPE_LABELS } from "@/lib/tree/hierarchy";
import type { ColumnAlign, ColumnDef } from "@/components/grid/columns";
import { FLAG_LABELS, FlagCell } from "./flags";

/**
 * Callbacks and rendering context the notes columns close over. Same shape as
 * `OutlineColumnCtx` — column defs stay pure data plus render, and the host swaps handlers
 * freely.
 */
export type NotesColumnCtx = {
  selectedId: string | null;
  editingId: string | null;
  /** False in Flat mode, where the stored note tree is deliberately not on screen. */
  showHierarchy: boolean;
  onToggleCollapsed: (note: NoteNode) => void;
  onOpenDetail: (note: NoteNode) => void;
  onFinishEdit: (note: NoteNode, title: string) => void;
  onCancelEdit: () => void;
  onFlagChange: (note: NoteNode, flag: NoteFlag) => void;
};

/** Default visible fields. Calendar parts stay available through Show Fields and Group by. */
export const NOTES_COLUMN_IDS = [
  "flag",
  "title",
  "snippet",
  "subject",
  "date",
  "contexts",
  "linked",
] as const;

function dateKey(date: Date | null): string | null {
  return date ? toDateKey(date) : null;
}

function formatDate(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    // Note Date is a stored calendar day encoded at UTC noon. Reading it in a local zone
    // can move the label in UTC+13/14; the UTC components are the durable day.
    timeZone: "UTC",
  });
}

function datePartColumn(
  dimension: NoteGroupBy,
  width: string,
  align?: ColumnAlign,
): ColumnDef<NotesColumnCtx, NoteNode> {
  return {
    id: dimension,
    label: GROUP_BY_LABELS[dimension],
    width,
    align,
    filterKind: "enum",
    filterValue: (row) => noteDatePart(row.node.noteDate, dimension)?.key ?? null,
    filterLabel: (value) => noteDatePartLabel(value, dimension),
    sortValue: (row) => noteDatePart(row.node.noteDate, dimension)?.rank ?? null,
    render: (row) => {
      const part = noteDatePart(row.node.noteDate, dimension);
      return (
        <span className="tabular truncate text-[0.8125rem] text-ink-muted">
          {part?.label ?? ""}
        </span>
      );
    },
  };
}

export const notesColumns: ColumnDef<NotesColumnCtx, NoteNode>[] = [
  {
    id: "flag",
    label: "Flag",
    width: "4rem",
    filterKind: "enum",
    filterValue: (row) =>
      row.node.flag === "none" ? null : FLAG_LABELS[row.node.flag],
    sortValue: (row) => FLAG_LABELS[row.node.flag],
    render: (row, ctx) => (
      <FlagPicker
        key={`flag:${row.node.flag}`}
        flag={row.node.flag}
        onChange={(flag) => ctx.onFlagChange(row.node, flag)}
      />
    ),
  },
  {
    id: "title",
    label: "Title",
    width: "minmax(12rem,1fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.title || null,
    sortValue: (row) => row.node.title.toLowerCase(),
    render: (row, ctx) => (
      <TitleCell
        note={row.node}
        depth={row.depth}
        showHierarchy={ctx.showHierarchy}
        selected={row.node.id === ctx.selectedId}
        editing={row.node.id === ctx.editingId}
        onToggleCollapsed={() => ctx.onToggleCollapsed(row.node)}
        onOpenDetail={() => ctx.onOpenDetail(row.node)}
        onFinishEdit={(title) => ctx.onFinishEdit(row.node, title)}
        onCancelEdit={ctx.onCancelEdit}
      />
    ),
  },
  {
    id: "snippet",
    // The column that replaces Achieve's always-present note panel: without body text in
    // the grid, two notes are indistinguishable while scanning. See `shape.md`.
    label: "Preview",
    width: "minmax(12rem,1.4fr)",
    filterKind: "text",
    filterValue: (row) => noteSnippet(row.node.body, 60) || null,
    render: (row) => <SnippetCell body={row.node.body} />,
  },
  {
    id: "subject",
    label: "Subject",
    width: "8rem",
    filterKind: "enum",
    filterValue: (row) => row.node.subject || null,
    sortValue: (row) => row.node.subject.toLowerCase(),
    render: (row) => (
      <span className="truncate text-[0.8125rem] text-ink-muted">
        {row.node.subject}
      </span>
    ),
  },
  {
    id: "date",
    label: "Date",
    width: "6rem",
    align: "right",
    filterKind: "date",
    filterValue: (row) => dateKey(row.node.noteDate),
    sortValue: (row) => dateKey(row.node.noteDate),
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {formatDate(row.node.noteDate)}
      </span>
    ),
  },
  // These are intentionally optional fields rather than three more defaults beside Date.
  // Their main job is to make the Year → Month → Day grouping accountable: each header
  // value can also be shown, sorted, or filtered as an ordinary column.
  datePartColumn("year", "4.5rem", "right"),
  datePartColumn("month", "6rem"),
  datePartColumn("day", "3.75rem", "right"),
  {
    id: "contexts",
    label: "Contexts",
    width: "9rem",
    filterKind: "text",
    filterValue: (row) => row.node.contexts.join(", ") || null,
    render: (row) => (
      <span className="truncate text-[0.8125rem] text-ink-muted">
        {row.node.contexts.join(", ")}
      </span>
    ),
  },
  {
    id: "linked",
    label: "Linked to",
    width: "10rem",
    filterKind: "text",
    filterValue: (row) => row.node.nodeName ?? row.node.contactName ?? null,
    sortValue: (row) =>
      (row.node.nodeName ?? row.node.contactName)?.toLowerCase() ?? null,
    render: (row) => {
      const name = row.node.nodeName ?? row.node.contactName;
      const kind = row.node.nodeName
        ? row.node.nodeType
          ? TYPE_LABELS[row.node.nodeType]
          : "Record"
        : row.node.contactName
          ? "Contact"
          : null;

      return name ? (
        <span
          className="truncate text-[0.8125rem] text-ink-muted"
          title={`${kind ?? ""}: ${name}`}
        >
          {name}
        </span>
      ) : (
        <span className="text-[0.8125rem] text-ink-faint">—</span>
      );
    },
  },
];

function SnippetCell({ body }: { body: string }) {
  const text = noteSnippet(body);

  return (
    <span
      className={`truncate text-[0.8125rem] ${text ? "text-ink-muted" : "text-ink-faint italic"}`}
      title={text || undefined}
    >
      {text || "Empty"}
    </span>
  );
}

/** Inline flag edit, matching the other tabs' "grid-visible fields are edited in place". */
function FlagPicker({
  flag,
  onChange,
}: {
  flag: NoteFlag;
  onChange: (flag: NoteFlag) => void;
}) {
  return (
    <label className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <FlagCell flag={flag} />
      <select
        value={flag}
        onChange={(event) => onChange(event.target.value as NoteFlag)}
        aria-label="Flag"
        // The visible dot and code do the reading; the select is the hit target.
        className="absolute h-5 w-14 cursor-pointer opacity-0"
      >
        {(Object.keys(FLAG_LABELS) as NoteFlag[]).map((option) => (
          <option key={option} value={option}>
            {FLAG_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Title cell: indent rails, expander, label or inline editor — the notes counterpart of
 * `NameCell`. Kept separate rather than generalising `NameCell`, because that one is built
 * around a node's type icon, type-scaled typography, and completed-state strikethrough,
 * none of which a note has.
 */
function TitleCell({
  note,
  depth,
  showHierarchy,
  selected,
  editing,
  onToggleCollapsed,
  onOpenDetail,
  onFinishEdit,
  onCancelEdit,
}: {
  note: NoteNode;
  depth: number;
  showHierarchy: boolean;
  selected: boolean;
  editing: boolean;
  onToggleCollapsed: () => void;
  onOpenDetail: () => void;
  onFinishEdit: (title: string) => void;
  onCancelEdit: () => void;
}) {
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
        aria-label={note.collapsed ? "Expand" : "Collapse"}
        tabIndex={-1}
        className={[
          "mr-1 ml-0.5 flex w-4 flex-none items-center justify-center text-[0.625rem] text-ink-faint",
          showHierarchy && note.hasChildren ? "hover:text-ink" : "invisible",
        ].join(" ")}
      >
        {note.collapsed ? "▶" : "▼"}
      </button>

      {editing ? (
        <TitleEditor
          initial={note.title}
          onCommit={onFinishEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <span
          className={[
            "min-w-0 flex-1 self-center truncate text-[0.875rem]",
            note.flag === "done" ? "text-ink-faint line-through" : "text-ink",
            note.title ? "" : "text-ink-faint italic",
          ].join(" ")}
        >
          {note.title || "Untitled note"}
        </span>
      )}

      {showHierarchy && note.collapsed && note.hasChildren && (
        <span className="tabular ml-2 flex-none self-center text-[0.6875rem] text-ink-faint">
          {note.childCount}
        </span>
      )}

      {selected && !editing && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail();
          }}
          aria-label="Open note"
          title="Open note (Enter)"
          tabIndex={-1}
          className="ml-2 flex-none self-center rounded px-1 text-[0.6875rem] leading-none text-ink-muted hover:bg-surface hover:text-ink"
        >
          ⤢
        </button>
      )}
    </div>
  );
}

function TitleEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (title: string) => void;
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
      onClick={(event) => event.stopPropagation()}
      aria-label="Title"
      className="min-w-0 flex-1 self-center rounded-sm border border-select-edge bg-surface px-1 text-[0.875rem] text-ink outline-none"
    />
  );
}
