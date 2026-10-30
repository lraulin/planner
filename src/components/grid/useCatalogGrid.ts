"use client";

import { useState, useTransition } from "react";
import type { ActionResult, QueryResult } from "@/app/actionResult";
import type { MenuItem } from "@/components/grid/ContextMenu";
import {
  catalogCapabilities,
  catalogTargetIds,
} from "@/components/grid/catalogCommands";
import type { ColumnDef } from "@/components/grid/columns";
import { rowMenuFor } from "@/components/grid/rowMenu";
import { useArrowKeySelection } from "@/components/grid/useArrowKeySelection";
import type { GridDefaults } from "@/components/grid/useGridState";
import { type BuiltInView, useModuleViews } from "@/components/grid/useModuleViews";
import { useMultiSelect } from "@/components/grid/useMultiSelect";
import { useNavigableIds } from "@/components/grid/useNavigableIds";
import { useViewStateUrl } from "@/components/url/useViewStateUrl";
import { collectDistinctValues } from "@/lib/grid/distinct";
import type { GridPageCommand } from "@/lib/grid/commandDeck";
import type { GridRow } from "@/lib/tree/slice";

/** The record catalogs carry no column context: every cell reads its own row. */
export type CatalogColumnCtx = Record<string, never>;

type CatalogNodeRow<TNode> = Extract<GridRow<TNode>, { kind: "node" }>;

/** Runs a server action for a page command, then reloads the list or shows the error. */
export type CatalogRun = (action: () => Promise<ActionResult>) => void;

export type CatalogGridOptions<TRow extends { id: string }, TNode extends TRow> = {
  /** The settings key for this grid's views — `jobs`, `houses`. */
  moduleId: string;
  /** Module-scope constants: `useModuleViews` keys off their identity. */
  builtIn: readonly BuiltInView<"all">[];
  defaultsFor: (builtInId: string) => GridDefaults;
  columns: ColumnDef<CatalogColumnCtx, TNode>[];
  /** The server's list. A new array replaces whatever the client was showing. */
  initialRows: TRow[];
  /** What a row becomes in the grid — Jobs adds a duration measured against today. */
  toNode: (row: TRow) => TNode;
  /** The row's name everywhere it is shown: the grid's row label, menus, the delete confirm. */
  nameOf: (row: TRow) => string;
  /** `{ one: "job", many: "jobs" }` — every label the catalog prints is built from these. */
  noun: { one: string; many: string };
  actions: {
    list: () => Promise<QueryResult<TRow[]>>;
    create: () => Promise<ActionResult>;
    remove: (id: string) => Promise<ActionResult>;
  };
  /** Commands this catalog has beyond New, Open and Delete. */
  pageCommands?: (
    rowId: string | null,
    count: number,
    run: CatalogRun,
  ) => readonly GridPageCommand[];
};

/**
 * Everything a **record catalog** — Jobs, Residences, Houses, Resources — does around its grid:
 * the server's rows, the views, selection and arrows, the record drawer on `?detail=`, and
 * New / Open / Delete with a confirm. `CatalogGrid` renders it.
 *
 * These four were one component copied four times, and the copies had started to differ the
 * way copies do. Delete is the one that mattered: each acted on `ids[0]` alone, so with three
 * rows selected it removed one. Here it removes the selection, as Contacts already did.
 *
 * Catalogs with more going on (Contacts' Google sync, Accounts' reconcile, Time Charts' inline
 * edits) keep their own wiring and share the smaller pieces this is built from.
 */
export function useCatalogGrid<TRow extends { id: string }, TNode extends TRow>({
  moduleId,
  builtIn,
  defaultsFor,
  columns,
  initialRows,
  toNode,
  nameOf,
  noun,
  actions,
  pageCommands,
}: CatalogGridOptions<TRow, TNode>) {
  const [rows, setRows] = useState(initialRows);
  const [seenServerRows, setSeenServerRows] = useState(initialRows);
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TRow[]>([]);
  const [, startTransition] = useTransition();
  const { detail: openId, setDetail: setOpenId } = useViewStateUrl();

  if (initialRows !== seenServerRows) {
    setSeenServerRows(initialRows);
    setRows(initialRows);
  }

  const views = useModuleViews({
    moduleId,
    builtIn,
    defaultViewId: "all",
    columns,
    defaultsFor,
  });

  const gridRows: CatalogNodeRow<TNode>[] = rows.map((row) => ({
    kind: "node",
    id: row.id,
    depth: 0,
    node: toNode(row),
  }));
  const distinctValues = collectDistinctValues(columns, gridRows);

  const { order, onIdsChange } = useNavigableIds(rows.map((row) => row.id));
  const {
    selectedId,
    selectedIds,
    select,
    selectAll,
    toggleSelectAll,
    headerState,
    move,
  } = useMultiSelect(order, null);

  async function reload() {
    const result = await actions.list();
    if (result.ok) setRows(result.data);
    else setError(result.error);
  }

  function refresh() {
    startTransition(reload);
  }

  function closeDrawer() {
    setOpenId(null);
    refresh();
  }

  const run: CatalogRun = (action) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await reload();
    });
  };

  function createNew() {
    setError(null);
    startTransition(async () => {
      const result = await actions.create();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) setOpenId(result.id);
    });
  }

  function requestDelete(ids: readonly string[]) {
    const targets = rows.filter((row) => ids.includes(row.id));
    if (targets.length > 0) setPendingDelete(targets);
  }

  // One at a time, stopping at the first refusal. The reload runs either way: rows removed
  // before a refusal are gone, and the list should say so.
  function confirmDelete() {
    const targets = pendingDelete;
    setPendingDelete([]);
    setError(null);
    startTransition(async () => {
      for (const target of targets) {
        const result = await actions.remove(target.id);
        if (!result.ok) {
          setError(result.error);
          break;
        }
        if (target.id === openId) setOpenId(null);
      }
      await reload();
    });
  }

  function capabilitiesFor(rowId: string | null, count: number) {
    const row = rows.find((entry) => entry.id === rowId);
    return catalogCapabilities({
      createLabel: `New ${noun.one}`,
      openLabel: `Open ${noun.one}`,
      selection: {
        id: rowId,
        count,
        label: row ? nameOf(row) : null,
        ids: catalogTargetIds(rowId, count, selectedIds, order),
      },
      onCreate: createNew,
      onOpen: setOpenId,
      onDelete: requestDelete,
      onSelectAll: selectAll,
      pageCommands: pageCommands?.(rowId, count, run),
    });
  }

  // Right-clicking a row inside the selection acts on the selection; any other row, on itself.
  // `null` is the blank area below the rows — the same menu with nothing selected.
  function rowMenu(rowId: string | null): MenuItem[] {
    if (rowId === null) return rowMenuFor(capabilitiesFor(null, 0));
    const count = selectedIds.has(rowId) ? selectedIds.size : 1;
    return rowMenuFor(capabilitiesFor(rowId, count));
  }

  useArrowKeySelection(move, openId !== null || pendingDelete.length > 0);

  return {
    noun,
    nameOf,
    columns,
    views,
    gridRows,
    distinctValues,
    counts,
    setCounts,
    error,
    selectedId,
    selectedIds,
    select,
    toggleSelectAll,
    headerState,
    onIdsChange,
    commandCapabilities: capabilitiesFor(selectedId, selectedIds.size),
    rowMenu,
    openId,
    openDrawer: setOpenId,
    closeDrawer,
    refresh,
    pendingDelete,
    confirmDelete,
    cancelDelete: () => setPendingDelete([]),
  };
}

export type CatalogGridApi<
  TRow extends { id: string },
  TNode extends TRow,
> = ReturnType<typeof useCatalogGrid<TRow, TNode>>;
