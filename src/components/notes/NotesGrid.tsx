"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { NoteFlag } from "@/db/schema";
import { JOURNAL_SUBJECT } from "@/lib/day/types";
import type { NoteNode, NotePosition } from "@/lib/notes/types";
import type { OutlineNode } from "@/lib/tree/types";
import type { ContactOption } from "@/lib/contacts/types";
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
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import { useSuspendCommandKeys } from "@/components/shell/CommandProvider";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { ToolbarButton, ToolbarSelect } from "@/components/tabs/tabChrome";
import {
  parseNotesView,
  serializeNotesView,
  type NotesViewSettings,
} from "@/lib/settings/notes";
import { notesViewScope } from "@/lib/settings/scopes";
import { selectionMoveRoots } from "@/lib/grid/selection";
import { copyAsText, writeClipboardText } from "@/lib/tree/copyAsText";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { notesColumns, NOTES_COLUMN_IDS, type NotesColumnCtx } from "./notesColumns";
import { NoteFilterDialog } from "./NoteFilterDialog";
import { NoteDrawer } from "./NoteDrawer";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";

const NOTES_VIEW_CODEC: SettingCodec<NotesViewSettings> = {
  parse: parseNotesView,
  serialize: serializeNotesView,
};

const NOTES_MODES: readonly NotesMode[] = ["nested", "flat"];

/**
 * One built-in view. Notes' three controls — Nested/Flat, Sort, Filter — are a *lot* of state
 * to rebuild by hand, which is exactly what makes saved views worth having here: "Flat, by
 * date, only meeting notes" is a view, not three settings you set again every Monday.
 */
const NOTES_VIEWS = [{ id: "notes", label: "All Notes" }] as const;

function viewDefaults(): GridDefaults {
  return { order: [...NOTES_COLUMN_IDS] };
}

/** Notes' own per-view settings, so saving a view carries the mode / sort / filter with it. */
function notesScopes(viewId: string): readonly string[] {
  return [notesViewScope(viewId)];
}

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
  contacts,
}: {
  initialNotes: NoteNode[];
  /** Records a note can be linked to. */
  nodes: OutlineNode[];
  /** People a note can be filed against, as Contact History. */
  contacts: ContactOption[];
}) {
  const [patches, setPatches] = useState<Record<string, Partial<NoteNode>>>({});
  const {
    note: urlNoteId,
    setNote: setUrlNoteId,
    mode: urlMode,
    setMode: setUrlMode,
  } = useViewStateUrl();

  const views = useModuleViews({
    moduleId: "notes",
    builtIn: NOTES_VIEWS,
    defaultViewId: "notes",
    // No view picker before this, so the stored layout is at `grid:notes` and stays there.
    defaultViewSharesModuleScope: true,
    columns: notesColumns,
    defaultsFor: viewDefaults,
    viewScopes: notesScopes,
  });
  const gridState = views.grid;

  /**
   * Notes' own settings, **per view**.
   *
   * Mode, sort and the filter dialog are what actually distinguish one way of working with
   * notes from another, and no column can carry them — so once Notes has views they belong to
   * the view, the same way the Task Chooser's weights always have. They used to sit in one
   * scope shared by the whole module, which meant a saved Notes view could only ever have
   * remembered its columns.
   */
  const { value: view, patch: patchView } = useSetting(
    notesViewScope(views.viewId),
    NOTES_VIEW_CODEC,
  );
  const { sort, filter } = view;

  /** `?mode=` overrides the stored mode when it names one; the store is the default. */
  const mode: NotesMode =
    urlMode !== null && (NOTES_MODES as readonly string[]).includes(urlMode)
      ? (urlMode as NotesMode)
      : view.mode;

  const setMode = useCallback(
    (next: NotesMode) => {
      patchView((current) => ({ ...current, mode: next }));
      setUrlMode(next);
    },
    [patchView, setUrlMode],
  );
  const setSort = useCallback(
    (next: NotesSort) => patchView((current) => ({ ...current, sort: next })),
    [patchView],
  );
  const setFilter = useCallback(
    (next: NoteFilter) => patchView((current) => ({ ...current, filter: next })),
    [patchView],
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NoteNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Drawer id is the URL. Unknown ids stay in the bar but open nothing, so a stale
  // bookmark does not crash the tab — it just looks empty until the user closes it.
  const drawerId = urlNoteId;

  const contactNameById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.displayName])),
    [contacts],
  );
  const notes = useMemo(
    () =>
      initialNotes.map((note) => {
        const linkedContactName = note.contactId
          ? (contactNameById.get(note.contactId) ?? null)
          : null;
        return {
          ...note,
          // Contact labels always come from `loadContactOptions`, the sole place where the
          // email fallback and other name rules are derived. The Notes read stays a cheap
          // tree query rather than duplicating that logic in SQL or a second helper.
          contactName: linkedContactName,
          ...patches[note.id],
        };
      }),
    [initialNotes, patches, contactNameById],
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

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        notesColumns,
        rows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [rows],
  );

  const orderedIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const multi = useMultiSelect(orderedIds, urlNoteId);
  const { selectedId, selectedIds, select, selectOne, move: moveSelection } = multi;

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const drawerNote = drawerId ? (byId.get(drawerId) ?? null) : null;

  // Back / forward and deep-links change `?note=`. Sync selection during render.
  const [seenNoteId, setSeenNoteId] = useState(urlNoteId);
  if (urlNoteId !== seenNoteId) {
    setSeenNoteId(urlNoteId);
    if (urlNoteId) selectOne(urlNoteId);
  }

  const openDetail = useCallback(
    (id: string) => {
      selectOne(id);
      setUrlNoteId(id);
    },
    [setUrlNoteId, selectOne],
  );

  const copySelectionAsText = useCallback(() => {
    const text = copyAsText(
      rows
        .filter(
          (row): row is Extract<typeof row, { kind: "node" }> => row.kind === "node",
        )
        .map((row) => ({
          id: row.id,
          name: row.node.title,
          depth: row.depth,
        })),
      selectedIds,
    );
    void writeClipboardText(text);
  }, [rows, selectedIds]);

  const closeDetail = useCallback(() => {
    setUrlNoteId(null);
  }, [setUrlNoteId]);

  const requestDelete = useCallback(
    (id: string) => {
      const note = byId.get(id);
      if (note) setPendingDelete(note);
    },
    [byId],
  );

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
          selectOne(result.id);
          setUrlNoteId(result.id);
        }
      });
    },
    [selected, setUrlNoteId, selectOne],
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

  // Show / hide / move now travel to Show Fields through `GridToolbar`, not from here.
  const { columns, sort: headerSort, clearSort: clearHeaderSort } = gridState;

  /**
   * Drag-to-reorder. Unlike the outline there are no nesting rules to enforce — any note
   * may sit under any note — so the only illegal drop is into a note's own subtree, which
   * `moveNote` re-checks on the server anyway.
   *
   * Needs nested + notes manual order (not a notes-view title/date sort). A column header
   * sort stays on during the drag; a successful drop clears it so the written tree order
   * is what you see (same as Outline / Achieve).
   */
  const canReorder = mode === "nested" && sort === "manual";

  /**
   * Everything a note row can do, for one row.
   *
   * `hierarchy` plus `onIndent` / `onOutdent` / `onMoveUp` / `onMoveDown`, so Indent, Outdent and the
   * vertical moves come out of `buildGridCommands` like the Outline's do. They existed here before as
   * hand-written row-menu entries printing `Ctrl+Insert` and `Shift+Tab` — the only two places in the
   * app spelling those chords out in words — and they were on no other surface at all.
   *
   * `canReorder` is the real gate: manual order in nested mode. Sorted or flat, the tree moves have
   * nowhere to land, so they arrive disabled with that as the reason rather than missing.
   */
  const capabilitiesFor = useCallback(
    (noteId: string | null, count: number): GridCommandCapabilities => {
      const note = noteId ? (byId.get(noteId) ?? null) : null;

      return {
        hierarchy: mode === "nested",
        selection: {
          id: noteId,
          count,
          label: note?.title,
          canMoveUp: canReorder,
          canMoveDown: canReorder,
          canIndent: canReorder,
          canOutdent: canReorder && note?.parentId !== null,
          moveReason: canReorder
            ? undefined
            : "Sort by Manual order in Nested mode to rearrange notes",
        },
        actions: {
          onOpen: (id) => openDetail(id),
          onCopyAsText: copySelectionAsText,
          onDelete: requestDelete,
          onIndent: (id) => apply(() => indentNoteAction(id)),
          onOutdent: (id) => apply(() => outdentNoteAction(id)),
          onMoveUp: (id) => apply(() => moveNoteVerticallyAction(id, "up")),
          onMoveDown: (id) => apply(() => moveNoteVerticallyAction(id, "down")),
          onExpandAll: () => apply(() => setAllNotesCollapsedAction(false)),
          onCollapseAll: () => apply(() => setAllNotesCollapsedAction(true)),
        },
        pageCommands: [
          /*
           * `grid.create.*` by id, overriding the built-ins. Notes are not typed nodes, so the
           * kind-driven `New task` / `New project` family does not apply — but "a new sibling row"
           * and "a new child row" are exactly the same two commands with the same two chords, so
           * they keep the ids and inherit the placement rather than inventing a parallel pair.
           */
          {
            id: "grid.create",
            label: "New note",
            group: "record",
            menu: "new",
            section: "New",
            icon: "new",
            toolbar: 10,
            bindings: [{ key: "Insert" }, { key: "Enter", meta: true }],
            run: () => addNote("sibling"),
          },
          {
            id: "grid.create.child",
            label: "New child note",
            group: "record",
            menu: "new",
            section: "Insert row",
            icon: "insert-child",
            toolbar: 22,
            rowMenu: true,
            bindings: [
              { key: "Insert", ctrl: true },
              { key: "Enter", meta: true, ctrl: true },
            ],
            disabled: note === null,
            title: note ? undefined : "Select a note first",
            run: () => addNote("child"),
          },
          {
            id: "notes.expand-all",
            label: "Expand all notes",
            group: "view",
            menu: "organize",
            section: "Expand",
            icon: "expand",
            run: () => apply(() => setAllNotesCollapsedAction(false)),
          },
          {
            id: "notes.collapse-all",
            label: "Collapse all notes",
            group: "view",
            menu: "organize",
            section: "Expand",
            icon: "collapse",
            run: () => apply(() => setAllNotesCollapsedAction(true)),
          },
        ],
      };
    },
    [
      mode,
      byId,
      canReorder,
      openDetail,
      copySelectionAsText,
      addNote,
      apply,
      requestDelete,
    ],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

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

    const rootsOf = (dragIds: readonly string[]) =>
      selectionMoveRoots(
        new Set(dragIds),
        dragIds,
        (id) => byId.get(id)?.parentId ?? null,
      );

    return {
      resolve: (dragIds, targetId, zone) => {
        const roots = rootsOf(dragIds);
        if (roots.length === 0) return null;
        if (dragIds.includes(targetId)) return null;
        for (const root of roots) {
          if (isInSubtree(root, targetId)) return null;
        }

        const target = byId.get(targetId);
        if (!target) return null;

        const depth = zone === "inside" ? target.depth + 1 : target.depth;
        return { depth };
      },
      onDrop: (dragIds, targetId, zone) => {
        const roots = rootsOf(dragIds);
        if (roots.length === 0) return;
        if (dragIds.includes(targetId)) return;

        const target = byId.get(targetId);
        if (!target) return;

        selectOne(roots[0]);
        if (headerSort) clearHeaderSort();
        apply(async () => {
          let previousId: string | null = null;
          let lastResult: { ok: true } | { ok: false; error: string } = { ok: true };
          for (const noteId of roots) {
            const params =
              previousId === null
                ? zone === "inside"
                  ? { parentId: targetId, position: { at: "last" as const } }
                  : {
                      parentId: target.parentId,
                      position: {
                        at:
                          zone === "before" ? ("before" as const) : ("after" as const),
                        siblingId: targetId,
                      } as NotePosition,
                    }
                : {
                    parentId: zone === "inside" ? targetId : target.parentId,
                    position: {
                      at: "after" as const,
                      siblingId: previousId,
                    } as NotePosition,
                  };
            lastResult = await moveNoteAction({ noteId, ...params });
            if (!lastResult.ok) return lastResult;
            previousId = noteId;
          }
          return lastResult;
        });
      },
    };
  }, [canReorder, byId, apply, selectOne, headerSort, clearHeaderSort]);

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (noteId: string | null): MenuItem[] => {
      const note = noteId ? (byId.get(noteId) ?? null) : null;
      const count = note && selectedIds.has(note.id) ? selectedIds.size : note ? 1 : 0;
      return rowMenuFor(capabilitiesFor(note?.id ?? null, count), {
        // Notes' moves are legal only under manual order in nested mode — a property of the
        // view's sort rather than of the row, which is why it is stated here and not in
        // `capabilitiesFor`.
        canMoveUp: canReorder,
        canMoveDown: canReorder,
        canIndent: canReorder,
        canOutdent: canReorder && note?.parentId != null,
        moveReason: canReorder
          ? undefined
          : "Sort by Manual order in Nested mode to rearrange notes",
      });
    },
    [byId, capabilitiesFor, canReorder, selectedIds],
  );

  /*
   * Selection navigation only. Insert, ⌘C, Enter, F2, Delete, Tab, ⇧Tab and ⌥↑/↓ were all here as a
   * `switch`; they are `bindings` on the commands now and `CommandKeys` fires them. This grid is
   * where that mattered most — it printed `Ctrl+Insert` and `Shift+Tab` in its row menu while
   * matching on `event.ctrlKey` and `event.shiftKey`, and nothing connected the two.
   *
   * The drawer and the inline editor are the two states the DOM cannot show, so they suspend the
   * dispatcher. The dialogs do not need to: they are `role="dialog"` and `isModalOpen` sees them.
   */
  useSuspendCommandKeys(drawerId !== null || editingId !== null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (drawerId || editingId || filterOpen || pendingDelete) return;
      if (isModalOpen()) return;
      if (isTypingTarget(event.target)) return;
      if (!selected) return;
      // ⌥↑/↓ is Move up / Move down, which is a command. Left alone here so the dispatcher gets it.
      if (event.altKey) return;

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(event.key === "ArrowUp" ? -1 : 1, event.shiftKey);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerId, editingId, filterOpen, pendingDelete, selected, moveSelection]);

  const filterActive = !isEmptyNoteFilter(filter);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Notes"
        allColumns={notesColumns}
        distinctValues={distinctValues}
        counts={counts}
        error={error}
        views={views}
        left={
          <>
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

            {/*
              Named for its subject rather than just "Filter": the shared toolbar now has a
              Filter of its own over the grid's *columns*, and two identically-labelled
              buttons that narrow the same list by different rules is the kind of thing
              nobody works out twice.
            */}
            <ToolbarButton onClick={() => setFilterOpen(true)}>
              {filterActive ? "Note filter (on)…" : "Note filter…"}
            </ToolbarButton>

            {filterActive && (
              <ToolbarButton onClick={() => setFilter(EMPTY_NOTE_FILTER)}>
                Clear note filter
              </ToolbarButton>
            )}

            {/* Journal entries are ordinary notes filed under one subject, so browsing them
                is the subject filter you can already set by hand — this is the one-click
                path to it, not a second notes system. */}
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
          </>
        }
        commandCapabilities={commandCapabilities}
      />

      <DataGrid
        rows={rows}
        columns={columns}
        allColumns={notesColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openDetail}
        ariaLabel="Notes"
        enableFilters
        enableSort
        sorts={gridState.sorts}
        onSortChange={gridState.toggleSort}
        onSetSort={gridState.setSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        advancedFilter={gridState.advancedFilter}
        search={gridState.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        rowDrag={rowDrag}
        rowMenu={rowMenu}
        rowNumbers
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

      <NoteDrawer
        note={drawerNote}
        nodes={nodes}
        contacts={contacts}
        subjects={subjects}
        onClose={closeDetail}
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
          if (selectedId === target.id) selectOne(null);
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
