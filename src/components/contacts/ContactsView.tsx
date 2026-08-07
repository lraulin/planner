"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { GridRow } from "@/lib/tree/slice";
import type { ContactListRow } from "@/lib/contacts/types";
import {
  createContactAction,
  deleteContactAction,
  listContactsAction,
} from "@/app/contacts/actions";
import { DataGrid } from "@/components/grid/DataGrid";
import type { MenuItem } from "@/components/grid/ContextMenu";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { catalogCapabilities } from "@/components/grid/catalogCommands";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { isTypingTarget } from "@/lib/keyboard";
import { ContactDrawer } from "./ContactDrawer";
import {
  contactsColumns,
  CONTACTS_COLUMN_IDS,
  type ContactsColumnCtx,
} from "./contactsColumns";

type ViewId = "all" | "open-items" | "by-company";

/**
 * Three built-in views.
 *
 * "Needs a Conversation" is the one that earns the module its place: a `nonblank` filter on
 * the open-discussion-item count, which is the whole reason discussion items are tasks. It
 * is a legitimate view rather than a mode — both the filter and the sort are reachable one
 * at a time from the toolbar (`data-grid.md`).
 */
const CONTACTS_VIEWS: { id: ViewId; label: string }[] = [
  { id: "all", label: "All Contacts" },
  { id: "open-items", label: "Needs a Conversation" },
  { id: "by-company", label: "By Company" },
];

function viewDefaults(id: string): GridDefaults {
  const base = { order: [...CONTACTS_COLUMN_IDS] };
  if (id === "open-items") {
    return {
      ...base,
      filters: {
        open: {
          mode: "custom",
          join: "and",
          conditions: [{ op: "nonblank", value: "" }],
        },
      },
    };
  }
  if (id === "by-company") return { ...base, groupBy: ["company"] };
  return base;
}

/**
 * Contacts module — Achieve's `Go -> Contacts`.
 *
 * Read-only cells, unlike the other list grids: a contact is name *parts* and typed
 * sub-records, neither of which survives being flattened into an inline text input. The
 * drawer is where a contact is edited.
 */
export function ContactsView({
  initialContacts,
}: {
  initialContacts: ContactListRow[];
}) {
  const [rows, setRows] = useState(initialContacts);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContactListRow | null>(null);
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();
  const [, startTransition] = useTransition();

  // Adjust state during render rather than in an effect — the same idiom the node grids use
  // for `navigableIds`. An effect here would render the stale list once before correcting it.
  const [seenServerRows, setSeenServerRows] = useState(initialContacts);
  if (initialContacts !== seenServerRows) {
    setSeenServerRows(initialContacts);
    setRows(initialContacts);
  }

  const views = useModuleViews({
    moduleId: "contacts",
    builtIn: CONTACTS_VIEWS,
    defaultViewId: "all",
    columns: contactsColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;

  const gridRows: GridRow<ContactListRow>[] = useMemo(
    () => rows.map((row) => ({ kind: "node", id: row.id, node: row, depth: 0 })),
    [rows],
  );

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        contactsColumns,
        gridRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [gridRows],
  );

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const { order, onIdsChange } = useNavigableIds(rowIds);
  const multi = useMultiSelect(order, null);
  const { selectedId, selectedIds, select, move } = multi;
  const refreshList = useCallback(() => {
    startTransition(async () => {
      const result = await listContactsAction();
      if (result.ok) setRows(result.data);
    });
  }, []);

  /**
   * `?detail=` is the only source of truth for which contact is open, so a clicked row and
   * a pasted URL take the same path. The drawer loads its own record from the id, the way
   * `NodeDetailDrawer` does — this view never fetches a detail.
   */
  const openDrawer = useCallback(
    (contactId: string) => setOpenId(contactId),
    [setOpenId],
  );

  const closeDrawer = useCallback(() => {
    setOpenId(null);
    refreshList();
  }, [setOpenId, refreshList]);

  const createNew = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await createContactAction({});
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Only the push. `createContactAction` already revalidated the layout, and adding a
      // second refresh in the same transition swallowed the navigation — the row appeared
      // and the drawer did not.
      if (result.id) openDrawer(result.id);
    });
  }, [openDrawer]);

  const confirmDelete = useCallback(() => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteContactAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openId === target.id) closeDrawer();
      else refreshList();
    });
  }, [pendingDelete, openId, closeDrawer, refreshList]);

  const requestDelete = useCallback(
    (id: string) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) setPendingDelete(row);
    },
    [rows],
  );

  const capabilitiesFor = useCallback(
    (rowId: string | null, count: number) =>
      catalogCapabilities({
        createLabel: "New contact",
        openLabel: "Open contact",
        selection: {
          id: rowId,
          count,
          label: rows.find((entry) => entry.id === rowId)?.displayName,
        },
        onCreate: createNew,
        onOpen: openDrawer,
        onDelete: requestDelete,
      }),
    [rows, createNew, openDrawer, requestDelete],
  );

  const commandCapabilities = useMemo(
    () => capabilitiesFor(selectedId, selectedIds.size),
    [capabilitiesFor, selectedId, selectedIds.size],
  );

  const columnCtx: ContactsColumnCtx = useMemo(
    () => ({ onOpen: (row) => openDrawer(row.id) }),
    [openDrawer],
  );

  const rowMenu = useCallback(
    // `null` is the blank area below the rows — the same menu with nothing selected.
    (contactId: string | null): MenuItem[] =>
      rowMenuFor(capabilitiesFor(contactId, contactId ? 1 : 0)),
    [capabilitiesFor],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (openId || pendingDelete) return;
      if (isTypingTarget(event.target)) return;

      // Arrows before the has-a-selection guard: `moveSelection` reads a null focus as
      // "start from the end you are heading towards", so ArrowDown is how you pick the
      // first row without reaching for the mouse.
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
        return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, pendingDelete, move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Contacts"
        allColumns={contactsColumns}
        distinctValues={distinctValues}
        groupDimensions={[]}
        counts={counts}
        error={error}
        views={views}
        commandCapabilities={commandCapabilities}
      />

      <DataGrid<ContactsColumnCtx, ContactListRow>
        rows={gridRows}
        columns={gridState.columns}
        allColumns={contactsColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={select}
        onOpenDetail={openDrawer}
        ariaLabel="Contacts"
        rowMenu={rowMenu}
        rowNumbers
        rowLabel={(row) => row.node.displayName}
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
        density={gridState.density}
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[0.9375rem] text-ink-muted">
            <p>No contacts yet.</p>
            <p className="text-[0.8125rem] text-ink-faint">
              People you need to reach, and the things you owe them a conversation
              about.
            </p>
          </div>
        }
      />

      <ContactDrawer contactId={openId} onClose={closeDrawer} onChanged={refreshList} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this contact?"
        message={`"${pendingDelete?.displayName ?? ""}" and their phone numbers, addresses and links will be removed. Discussion items and history notes are kept, unlinked.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
