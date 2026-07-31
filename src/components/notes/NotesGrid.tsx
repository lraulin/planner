"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { NoteFlag } from "@/db/schema";
import { JOURNAL_SUBJECT } from "@/lib/day/types";
import type { NoteNode, NotePosition } from "@/lib/notes/types";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import {
  sliceNotes,
  subjectOptions,
  type NotesMode,
  type NotesSort,
} from "@/lib/notes/slice";
import {
  contextOptions,
  EMPTY_NOTE_FILTER,
  isEmptyNoteFilter,
  notePassesFilter,
  type NoteFilter,
} from "@/lib/notes/filter";
import {
  createNoteAction,
  deleteNoteAction,
  indentNoteAction,
  moveNoteAction,
  moveNoteVerticallyAction,
  outdentNoteAction,
  setAllNotesCollapsedAction,
  setNoteCollapsedAction,
  updateNoteAction,
} from "@/app/notes/actions";
import { DataGrid, type RowDrag } from "@/components/grid/DataGrid";
import { useGridState } from "@/components/grid/useGridState";
import { ShowFieldsDialog } from "@/components/grid/ShowFieldsDialog";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import type { MenuItem } from "@/components/grid/ContextMenu";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarSelect,
} from "@/components/tabs/tabChrome";
import { notesColumns, NOTES_COLUMN_IDS, type NotesColumnCtx } from "./notesColumns";
import { NoteFilterDialog } from "./NoteFilterDialog";
import { NoteDrawer } from "./NoteDrawer";
import { isTypingTarget } from "@/lib/keyboard";

/**
 * The Notes tab.
 *
 * Achieve's View dropdown bundled panel orientation, sort, and (falsely) hierarchy into one
 * control. Here they are three: **Nested | Flat**, **Sort**, and **Filter…**, each doing
 * one thing. Manual sort is only offered when nested, because "the order you dragged them
 * into" is a statement about a tree.
 */
export function NotesGrid({
  initialNotes,
  nodes,
  initialNoteId,
}: {
  initialNotes: NoteNode[];
  /** Records a note can be linked to. */
  nodes: OutlineNode[];
  /** From `?note=<id>` — opens the drawer straight onto that note. */
  initialNoteId?: string | null;
}) {
  const [patches, setPatches] = useState<Record<string, Partial<NoteNode>>>({});
  const [mode, setMode] = useState<NotesMode>("nested");
  const [sort, setSort] = useState<NotesSort>("manual");
  const [filter, setFilter] = useState<NoteFilter>(EMPTY_NOTE_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialNoteId ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(initialNoteId ?? null);
  const [pendingDelete, setPendingDelete] = useState<NoteNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const notes = useMemo(
    () =>
      initialNotes.map((note) =>
        patches[note.id] ? { ...note, ...patches[note.id] } : note,
      ),
    [initialNotes, patches],
  );

  const byId = useMemo(() => {
    const map = new Map<string, NoteNode>();
    for (const note of notes) map.set(note.id, note);
    return map;
  }, [notes]);

  const patch = useCallback((id: string, changes: Partial<NoteNode>) => {
    setPatches((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  }, []);

  const apply = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) setError(result.error);
        // Server props refresh on success; drop the optimistic layer either way.
        setPatches({});
      });
    },
    [],
  );

  const subjects = useMemo(() => subjectOptions(notes), [notes]);
  const contexts = useMemo(() => contextOptions(notes), [notes]);

  const rows: GridRow<NoteNode>[] = useMemo(() => {
    const keep = isEmptyNoteFilter(filter)
      ? undefined
      : (note: NoteNode) => notePassesFilter(note, filter);

    return sliceNotes(notes, { mode, sort, keep }).map((row) => ({
      kind: "node" as const,
      id: row.id,
      node: row.note,
      depth: row.depth,
    }));
  }, [notes, mode, sort, filter]);

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const drawerNote = drawerId ? (byId.get(drawerId) ?? null) : null;

  const openDetail = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerId(id);
  }, []);

  const addNote = useCallback(
    (where: "sibling" | "child") => {
      const params =
        selected && where === "child"
          ? { parentId: selected.id, position: { at: "last" as const } }
          : selected
            ? {
                parentId: selected.parentId,
                position: { at: "after" as const, siblingId: selected.id },
              }
            : { parentId: null, position: { at: "last" as const } };

      setError(null);
      startTransition(async () => {
        const result = await createNoteAction(params);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setPatches({});
        // Open the new note straight away: a note with no body is not worth a row on its
        // own, and the reason you made one is to write in it.
        if (result.id) {
          setSelectedId(result.id);
          setDrawerId(result.id);
        }
      });
    },
    [selected],
  );

  const columnCtx: NotesColumnCtx = useMemo(
    () => ({
      selectedId,
      editingId,
      onToggleCollapsed: (note) => {
        if (!note.hasChildren) return;
        const collapsed = !note.collapsed;
        patch(note.id, { collapsed });
        apply(() => setNoteCollapsedAction(note.id, collapsed));
      },
      onOpenDetail: (note) => openDetail(note.id),
      onFinishEdit: (note, title) => {
        setEditingId(null);
        if (title !== note.title) {
          patch(note.id, { title });
          apply(() => updateNoteAction(note.id, { title }));
        }
      },
      onCancelEdit: () => setEditingId(null),
      onFlagChange: (note, flag: NoteFlag) => {
        patch(note.id, { flag });
        apply(() => updateNoteAction(note.id, { flag }));
      },
    }),
    [selectedId, editingId, patch, apply, openDetail],
  );

  const gridState = useGridState("notes", notesColumns, [...NOTES_COLUMN_IDS]);
  const { columns, show, hide, move } = gridState;

  /**
   * Drag-to-reorder. Unlike the outline there are no nesting rules to enforce — any note
   * may sit under any note — so the only illegal drop is into a note's own subtree, which
   * `moveNote` re-checks on the server anyway.
   *
   * Turned off entirely unless the rows on screen are the stored tree: dragging a row into
   * a position within a sorted or flattened list would write an order nothing displays.
   */
  const canReorder = mode === "nested" && sort === "manual";

  const rowDrag: RowDrag | undefined = useMemo(() => {
    if (!canReorder) return undefined;

    const isInSubtree = (ancestorId: string, candidateId: string | null): boolean => {
      let current = candidateId;
      while (current !== null) {
        if (current === ancestorId) return true;
        current = byId.get(current)?.parentId ?? null;
      }
      return false;
    };

    return {
      resolve: (dragId, targetId, zone) => {
        if (dragId === targetId) return null;
        if (isInSubtree(dragId, targetId)) return null;

        const target = byId.get(targetId);
        if (!target) return null;

        const depth = zone === "inside" ? target.depth + 1 : target.depth;
        return { depth };
      },
      onDrop: (dragId, targetId, zone) => {
        const target = byId.get(targetId);
        if (!target) return;

        const params =
          zone === "inside"
            ? { parentId: targetId, position: { at: "last" as const } }
            : {
                parentId: target.parentId,
                position: {
                  at: zone === "before" ? ("before" as const) : ("after" as const),
                  siblingId: targetId,
                } as NotePosition,
              };

        apply(() => moveNoteAction({ noteId: dragId, ...params }));
      },
    };
  }, [canReorder, byId, apply]);

  const rowMenu = useCallback(
    (noteId: string): MenuItem[] => {
      const note = byId.get(noteId);
      if (!note) return [];

      return [
        { label: "Open note", shortcut: "Enter", onSelect: () => openDetail(noteId) },
        { label: "Rename", shortcut: "F2", onSelect: () => setEditingId(noteId) },
        {
          label: "New note after",
          shortcut: "Insert",
          onSelect: () => addNote("sibling"),
        },
        {
          label: "New child note",
          shortcut: "Ctrl+Insert",
          onSelect: () => addNote("child"),
        },
        {
          label: "Indent",
          shortcut: "Tab",
          disabled: !canReorder,
          onSelect: () => apply(() => indentNoteAction(noteId)),
        },
        {
          label: "Outdent",
          shortcut: "Shift+Tab",
          disabled: !canReorder || note.parentId === null,
          onSelect: () => apply(() => outdentNoteAction(noteId)),
        },
        { label: "Delete", shortcut: "Delete", onSelect: () => setPendingDelete(note) },
      ];
    },
    [byId, openDetail, addNote, apply, canReorder],
  );

  // Keyboard, matching Achieve's own hint bar and the bindings every other tab uses.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (drawerId || editingId || filterOpen || fieldsOpen || pendingDelete) return;

      if (isTypingTarget(event.target)) return;

      if (event.key === "Insert") {
        event.preventDefault();
        addNote(event.ctrlKey || event.metaKey ? "child" : "sibling");
        return;
      }

      if (!selected) return;

      switch (event.key) {
        case "Enter":
          event.preventDefault();
          openDetail(selected.id);
          break;
        case "F2":
          event.preventDefault();
          setEditingId(selected.id);
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          setPendingDelete(selected);
          break;
        case "Tab": {
          if (!canReorder) return;
          event.preventDefault();
          apply(() =>
            event.shiftKey
              ? outdentNoteAction(selected.id)
              : indentNoteAction(selected.id),
          );
          break;
        }
        case "ArrowUp":
        case "ArrowDown": {
          const index = rows.findIndex((row) => row.id === selected.id);
          if (index === -1) return;
          event.preventDefault();

          if (event.altKey) {
            if (!canReorder) return;
            apply(() =>
              moveNoteVerticallyAction(
                selected.id,
                event.key === "ArrowUp" ? "up" : "down",
              ),
            );
            return;
          }

          const next = rows[index + (event.key === "ArrowUp" ? -1 : 1)];
          if (next) setSelectedId(next.id);
          break;
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    drawerId,
    editingId,
    filterOpen,
    fieldsOpen,
    pendingDelete,
    selected,
    rows,
    addNote,
    openDetail,
    apply,
    canReorder,
  ]);

  const filterActive = !isEmptyNoteFilter(filter);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <TabToolbar>
        <ToolbarSelect
          label="Show"
          value={mode}
          onChange={(next) => {
            const nextMode = next as NotesMode;
            setMode(nextMode);
            // Manual order is a statement about a tree; a flat list has none to show.
            if (nextMode === "flat" && sort === "manual") setSort("title");
          }}
          options={[
            { value: "nested", label: "Nested" },
            { value: "flat", label: "Flat" },
          ]}
        />

        <ToolbarSelect
          label="Sort"
          value={sort}
          onChange={(next) => setSort(next as NotesSort)}
          options={[
            ...(mode === "nested" ? [{ value: "manual", label: "Manual" }] : []),
            { value: "title", label: "Title" },
            { value: "date", label: "Date" },
          ]}
        />

        <ToolbarButton onClick={() => setFilterOpen(true)}>
          {filterActive ? "Filter (on)…" : "Filter…"}
        </ToolbarButton>

        {filterActive && (
          <ToolbarButton onClick={() => setFilter(EMPTY_NOTE_FILTER)}>
            Clear filter
          </ToolbarButton>
        )}

        {/* Journal entries are ordinary notes filed under one subject, so browsing them is
            the subject filter you can already set by hand — this is the one-click path to
            it, not a second notes system. */}
        <ToolbarButton
          onClick={() =>
            setFilter({
              ...EMPTY_NOTE_FILTER,
              subjects: [JOURNAL_SUBJECT],
              subjectMode: "any",
            })
          }
          title="Show the Day tab's daily notes"
        >
          Journal
        </ToolbarButton>

        <span className="h-4 w-px bg-rule" aria-hidden />

        <ToolbarButton onClick={() => addNote("sibling")} title="Insert">
          New note
        </ToolbarButton>
        <ToolbarButton
          onClick={() => addNote("child")}
          disabled={!selected}
          title="Ctrl+Insert"
        >
          New child
        </ToolbarButton>
        <ToolbarButton
          onClick={() => setPendingDelete(selected)}
          disabled={!selected}
          title="Delete"
        >
          Delete
        </ToolbarButton>

        <span className="h-4 w-px bg-rule" aria-hidden />

        <ToolbarButton onClick={() => apply(() => setAllNotesCollapsedAction(false))}>
          Expand all
        </ToolbarButton>
        <ToolbarButton onClick={() => apply(() => setAllNotesCollapsedAction(true))}>
          Collapse all
        </ToolbarButton>
        <ToolbarButton onClick={() => setFieldsOpen(true)}>Show Fields…</ToolbarButton>
      </TabToolbar>

      {error && <ErrorBanner message={error} />}

      <DataGrid
        rows={rows}
        columns={columns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpenDetail={openDetail}
        ariaLabel="Notes"
        enableFilters
        enableSort
        rowDrag={rowDrag}
        rowMenu={rowMenu}
        rowLabel={(row) => `Note: ${row.node.title || "Untitled"}`}
        rowExpansion={(row) => (row.node.hasChildren ? !row.node.collapsed : undefined)}
        empty={
          <EmptyState
            filtered={notes.length > 0}
            onAdd={() => addNote("sibling")}
            onClearFilter={() => setFilter(EMPTY_NOTE_FILTER)}
          />
        }
      />

      <NoteFilterDialog
        open={filterOpen}
        filter={filter}
        subjects={subjects}
        contexts={contexts}
        onApply={setFilter}
        onClose={() => setFilterOpen(false)}
      />

      <ShowFieldsDialog
        open={fieldsOpen}
        allColumns={notesColumns}
        shownIds={columns.map((column) => column.id)}
        onShow={show}
        onHide={hide}
        onMove={move}
        onReset={gridState.resetColumns}
        onClose={() => setFieldsOpen(false)}
      />

      <NoteDrawer
        note={drawerNote}
        nodes={nodes}
        subjects={subjects}
        onClose={() => setDrawerId(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this note?"
        message={deleteMessage(pendingDelete)}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          if (selectedId === target.id) setSelectedId(null);
          apply(() => deleteNoteAction(target.id));
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function deleteMessage(note: NoteNode | null): string {
  if (!note) return "This note will be removed. This cannot be undone.";
  const name = note.title ? `"${note.title}"` : "This untitled note";
  // Say what else goes with it — the subtree cascades, and that is not obvious from a row.
  return note.hasChildren
    ? `${name} and the ${note.childCount === 1 ? "note" : `${note.childCount} notes`} under it will be removed. This cannot be undone.`
    : `${name} will be removed. This cannot be undone.`;
}

function EmptyState({
  filtered,
  onAdd,
  onClearFilter,
}: {
  /** True when notes exist but none survived the filter. */
  filtered: boolean;
  onAdd: () => void;
  onClearFilter: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-[0.9375rem] text-ink-muted">
        {filtered ? "No notes match this filter." : "No notes yet."}
      </p>
      <div className="flex gap-2">
        {filtered ? (
          <ToolbarButton onClick={onClearFilter}>Clear filter</ToolbarButton>
        ) : (
          <ToolbarButton onClick={onAdd}>New note</ToolbarButton>
        )}
      </div>
    </div>
  );
}
