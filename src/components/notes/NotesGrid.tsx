"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { NoteFlag } from "@/db/schema";
import { INSERT_AFTER, INSERT_CHILD } from "@/lib/commands/chords";
import type { NoteNode, NotePosition, NoteSummary } from "@/lib/notes/types";
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
  filterRequiresBody,
  isEmptyNoteFilter,
  summaryPassesFilter,
  type NoteFilter,
} from "@/lib/notes/filter";
import {
  createNoteAction,
  deleteNoteAction,
  getNoteAction,
  indentNoteAction,
  matchNoteFilterAction,
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
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { asNoteGroupBy, groupNotes, NOTE_GROUP_BY_VALUES } from "@/lib/notes/grouping";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import { useSuspendCommandKeys } from "@/components/shell/CommandProvider";
import {
  useDisplaySettings,
  useSetting,
  type SettingCodec,
} from "@/components/settings/SettingsProvider";
import { ToolbarButton, ToolbarSelect } from "@/components/tabs/tabChrome";
import {
  notesMatchDefaults,
  parseNotesView,
  serializeNotesView,
  type NotesViewSettings,
} from "@/lib/settings/notes";
import { notesViewScope, WORKING_VIEW_ID } from "@/lib/settings/scopes";
import { selectionMoveRoots } from "@/lib/grid/selection";
import { copyAsText, writeClipboardText } from "@/lib/tree/copyAsText";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { notesColumns, NOTES_COLUMN_IDS, type NotesColumnCtx } from "./notesColumns";
import { FileImportHost } from "@/components/import/FileImportHost";
import { TomboyImportPanel } from "@/components/settings/TomboyImportPanel";
import { NoteFilterDialog } from "./NoteFilterDialog";
import { NoteDrawer } from "./NoteDrawer";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";

const NOTES_VIEW_CODEC: SettingCodec<NotesViewSettings> = {
  parse: parseNotesView,
  serialize: serializeNotesView,
};

const NOTES_MODES: readonly NotesMode[] = ["nested", "flat"];

/**
 * One built-in view. Notes' mode, sort, grouping, and filter are a *lot* of state to rebuild
 * by hand, which is exactly what makes saved views worth having here: "By year and month,
 * only journal notes" is a view, not four settings you set again every Monday.
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
 * control. Here **Nested | Flat**, **Sort**, **Group by**, and **Filter…** each do one
 * thing. Manual sort is only offered when nested, because "the order you dragged them
 * into" is a statement about a tree; grouping is a flat display hierarchy.
 */
export function NotesGrid({
  initialNotes,
  initialBodyMatchIds = null,
  initialOpenNote = null,
  nodes,
  contacts,
}: {
  /** List rows: metadata + snippet, never Markdown bodies. */
  initialNotes: NoteSummary[];
  /**
   * When the saved filter searches bodies, the server precomputes matching ids so first
   * paint is correct without shipping every body. Null means filter client-side.
   */
  initialBodyMatchIds?: string[] | null;
  /** Deep-linked note detail from the server, if `?note=` was present. */
  initialOpenNote?: NoteNode | null;
  /** Records a note can be linked to. */
  nodes: OutlineNode[];
  /** People a note can be filed against, as Contact History. */
  contacts: ContactOption[];
}) {
  const { value: displaySettings } = useDisplaySettings();
  const [patches, setPatches] = useState<Record<string, Partial<NoteSummary>>>({});
  // Keep patches until server props refresh — clearing on action settle flickers the old tree.
  const [baselineNotes, setBaselineNotes] = useState(initialNotes);
  if (initialNotes !== baselineNotes) {
    setBaselineNotes(initialNotes);
    if (Object.keys(patches).length > 0) setPatches({});
  }
  /** Server body-match ids for the active filter; null = local filter is enough. */
  const [bodyMatchIds, setBodyMatchIds] = useState<string[] | null>(
    initialBodyMatchIds,
  );
  const [bodyMatchPending, setBodyMatchPending] = useState(false);
  const [baselineBodyMatch, setBaselineBodyMatch] = useState(initialBodyMatchIds);
  if (initialBodyMatchIds !== baselineBodyMatch) {
    setBaselineBodyMatch(initialBodyMatchIds);
    setBodyMatchIds(initialBodyMatchIds);
  }
  /** Full notes loaded for the drawer, keyed by id. */
  const [details, setDetails] = useState<Record<string, NoteNode>>(() =>
    initialOpenNote ? { [initialOpenNote.id]: initialOpenNote } : {},
  );
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
    columns: notesColumns,
    defaultsFor: viewDefaults,
    viewScopes: notesScopes,
    extrasMatchDefaults: notesMatchDefaults,
  });
  const gridState = views.grid;
  const setGridGroupBy = gridState.setGroupBy;

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
    notesViewScope(WORKING_VIEW_ID),
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
  const noteGroupBy = useMemo(
    () => asNoteGroupBy(gridState.groupBy),
    [gridState.groupBy],
  );
  const showHierarchy = mode === "nested" && noteGroupBy.length === 0;

  /**
   * Group headers and the stored parent/child tree are two competing arrangements.
   * Choosing a group therefore moves to Flat; the database hierarchy is untouched and
   * returns when the user chooses Nested again. Date is the safest replacement for Manual
   * because it preserves the journal-focused ordering that Notes already defaults to.
   */
  const setNoteGroupBy = useCallback(
    (next: string[]) => {
      if (next.length > 0 && mode !== "flat") {
        setMode("flat");
        if (sort === "manual") setSort("date");
      }
      setGridGroupBy(next);
    },
    [mode, setGridGroupBy, setMode, setSort, sort],
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<readonly string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NoteSummary | null>(null);
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
    const map = new Map<string, NoteSummary>();
    for (const note of notes) map.set(note.id, note);
    return map;
  }, [notes]);

  const patch = useCallback((id: string, changes: Partial<NoteSummary>) => {
    setPatches((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  }, []);

  const apply = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          // Rejected: revert immediately. Success waits for `initialNotes` above.
          setPatches({});
        }
      });
    },
    [],
  );

  /**
   * When the filter starts needing bodies, ask the server for matching ids. Local title /
   * subject / context criteria still run client-side on summaries. The server already
   * resolved the saved filter on first paint — skip that first body fetch.
   *
   * When the filter does not need bodies, `activeBodyMatchIds` is null without clearing
   * stored ids (avoids setState-in-effect on every filter tweak that drops body search).
   */
  const needsBody = filterRequiresBody(filter);
  const skipInitialBodyFetch = useRef(
    initialBodyMatchIds !== null && filterRequiresBody(filter),
  );
  useEffect(() => {
    if (!filterRequiresBody(filter)) return;
    if (skipInitialBodyFetch.current) {
      skipInitialBodyFetch.current = false;
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      setBodyMatchPending(true);
      const result = await matchNoteFilterAction(filter);
      if (cancelled) return;
      setBodyMatchPending(false);
      if (result.ok) setBodyMatchIds(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const subjects = useMemo(() => subjectOptions(notes), [notes]);
  const contexts = useMemo(() => contextOptions(notes), [notes]);

  const activeBodyMatchIds = needsBody ? bodyMatchIds : null;
  const bodyMatchSet = useMemo(
    () => (activeBodyMatchIds ? new Set(activeBodyMatchIds) : null),
    [activeBodyMatchIds],
  );

  const rows: GridRow<NoteSummary>[] = useMemo(() => {
    const keep = isEmptyNoteFilter(filter)
      ? undefined
      : (note: NoteSummary) => {
          if (filterRequiresBody(filter)) {
            // While reconciling an unsaved body filter, keep previous matches rather than
            // flashing an empty grid.
            if (bodyMatchPending && !bodyMatchSet) return true;
            if (!bodyMatchSet) return false;
            return bodyMatchSet.has(note.id);
          }
          return summaryPassesFilter(note, filter);
        };

    const sliced = sliceNotes(notes, {
      // Defensive as well as intentional: a saved view written by an older build cannot
      // make date groups fight a nested tree even if its Notes-specific mode says Nested.
      mode: noteGroupBy.length > 0 ? "flat" : mode,
      sort,
      keep,
    });
    return groupNotes(sliced, noteGroupBy, displaySettings.dateFormat);
  }, [
    notes,
    mode,
    sort,
    filter,
    noteGroupBy,
    displaySettings.dateFormat,
    bodyMatchSet,
    bodyMatchPending,
  ]);

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        notesColumns,
        rows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [rows],
  );

  const rowIds = useMemo(
    () => rows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [rows],
  );
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, urlNoteId);
  const {
    selectedId,
    selectedIds,
    select,
    selectOne,
    selectAll,
    toggleSelectAll,
    headerState,
    move: moveSelection,
  } = multi;

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const drawerNote = drawerId ? (details[drawerId] ?? null) : null;

  // Back / forward and deep-links change `?note=`. Sync selection during render.
  const [seenNoteId, setSeenNoteId] = useState(urlNoteId);
  if (urlNoteId !== seenNoteId) {
    setSeenNoteId(urlNoteId);
    if (urlNoteId) selectOne(urlNoteId);
  }

  // Load full body when the drawer opens on a summary-only row.
  useEffect(() => {
    if (!drawerId) return;
    if (details[drawerId]) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await getNoteAction(drawerId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data) {
        setDetails((current) => ({ ...current, [result.data!.id]: result.data! }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [drawerId, details]);

  const openDetail = useCallback(
    (id: string) => {
      selectOne(id);
      setUrlNoteId(id);
    },
    [setUrlNoteId, selectOne],
  );

  const onSummaryPatched = useCallback(
    (summary: NoteSummary) => {
      patch(summary.id, summary);
      setDetails((current) => {
        const existing = current[summary.id];
        if (!existing) return current;
        return {
          ...current,
          [summary.id]: {
            ...existing,
            title: summary.title,
            subject: summary.subject,
            noteDate: summary.noteDate,
            flag: summary.flag,
            contexts: summary.contexts,
            nodeId: summary.nodeId,
            contactId: summary.contactId,
            nodeName: summary.nodeName,
            nodeType: summary.nodeType,
            updatedAt: summary.updatedAt,
          },
        };
      });
    },
    [patch],
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

      if (where === "child" && selected?.collapsed) {
        patch(selected.id, { collapsed: false });
      }

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
    [selected, setUrlNoteId, selectOne, patch],
  );

  const columnCtx: NotesColumnCtx = useMemo(
    () => ({
      editingId,
      showHierarchy,
      onToggleCollapsed: (note) => {
        if (!showHierarchy || !note.hasChildren) return;
        const collapsed = !note.collapsed;
        patch(note.id, { collapsed });
        apply(() => setNoteCollapsedAction(note.id, collapsed));
      },
      onOpenDetail: (note) => openDetail(note.id),
      onFinishEdit: (note, title) => {
        setEditingId(null);
        if (title !== note.title) {
          patch(note.id, { title });
          apply(async () => {
            const result = await updateNoteAction(note.id, { title });
            if (result.ok && result.data) onSummaryPatched(result.data);
            return result;
          });
        }
      },
      onCancelEdit: () => setEditingId(null),
      onFlagChange: (note, flag: NoteFlag) => {
        patch(note.id, { flag });
        apply(async () => {
          const result = await updateNoteAction(note.id, { flag });
          if (result.ok && result.data) onSummaryPatched(result.data);
          return result;
        });
      },
    }),
    [editingId, showHierarchy, patch, apply, openDetail, onSummaryPatched],
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
  const canReorder = showHierarchy && sort === "manual";

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
        hierarchy: showHierarchy,
        selection: {
          id: noteId,
          count,
          label: note?.title,
          ids:
            noteId && selectedIds.has(noteId)
              ? order.filter((id) => selectedIds.has(id))
              : noteId
                ? [noteId]
                : [],
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
          onSelectAll: selectAll,
          onDelete: (ids) => ids.forEach(requestDelete),
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
            bindings: INSERT_AFTER,
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
            bindings: INSERT_CHILD,
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
      showHierarchy,
      byId,
      canReorder,
      order,
      selectedIds,
      openDetail,
      copySelectionAsText,
      selectAll,
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
      onExpand: (id) => {
        if (!showHierarchy) return;
        const note = byId.get(id);
        if (!note?.hasChildren || !note.collapsed) return;
        patch(id, { collapsed: false });
        apply(() => setNoteCollapsedAction(id, false));
      },
    };
  }, [
    canReorder,
    byId,
    apply,
    selectOne,
    headerSort,
    clearHeaderSort,
    showHierarchy,
    patch,
  ]);

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
   * Selection navigation only. The insert chords, ⌘C, ⏎, ⇧⏎, ⌫, Tab, ⇧Tab and ⌥↑/↓ were all here as a
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
        grid={{ ...gridState, setGroupBy: setNoteGroupBy }}
        gridLabel="Notes"
        allColumns={notesColumns}
        distinctValues={distinctValues}
        groupDimensions={NOTE_GROUP_BY_VALUES}
        groupIds={groupIds}
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
                // The note tree and calendar grouping are alternate arrangements, not two
                // independent indentation systems.
                if (nextMode === "nested" && noteGroupBy.length > 0) {
                  setGridGroupBy([]);
                }
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
        selectAllState={headerState}
        onToggleSelectAll={toggleSelectAll}
        gutter="handle"
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
        onNavigableIdsChange={onIdsChange}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        onGroupIdsChange={setGroupIds}
        rowDrag={rowDrag}
        rowMenu={rowMenu}
        rowLabel={(row) => `Note: ${row.node.title || "Untitled"}`}
        rowExpansion={(row) =>
          showHierarchy && row.node.hasChildren ? !row.node.collapsed : undefined
        }
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
        onSaved={onSummaryPatched}
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

      <FileImportHost
        commandId="import.tomboy"
        label="Import Tomboy…"
        keywords="tomboy note xml sync"
        title="Import Tomboy"
      >
        <TomboyImportPanel embedded />
      </FileImportHost>
    </div>
  );
}

function deleteMessage(note: NoteSummary | null): string {
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
