"use client";

import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { DataGrid } from "@/components/grid/DataGrid";
import { GridToolbar } from "@/components/grid/GridToolbar";
import type {
  CatalogColumnCtx,
  CatalogGridApi,
} from "@/components/grid/useCatalogGrid";

/**
 * The page of a record catalog: toolbar, grid, its record drawer, and the delete confirm.
 * `useCatalogGrid` holds the behaviour; this lays it out the same way for every catalog.
 */
export function CatalogGrid<TRow extends { id: string }, TNode extends TRow>({
  catalog,
  emptyHint,
  deleteMessage,
  drawer,
}: {
  catalog: CatalogGridApi<TRow, TNode>;
  /** The line under "No jobs yet." — why the list is worth filling. */
  emptyHint: string;
  /**
   * What deleting costs, given who is going: `"Acme"` for one row, `3 jobs` for several.
   * `count` picks "its" or "their".
   */
  deleteMessage: (subject: string, count: number) => string;
  /** The record drawer, opened on `catalog.openId`. */
  drawer: ReactNode;
}) {
  const { noun, nameOf, pendingDelete } = catalog;
  const label = noun.many.charAt(0).toUpperCase() + noun.many.slice(1);
  const [onlyTarget] = pendingDelete;
  const deleteSubject =
    pendingDelete.length === 1 && onlyTarget
      ? `"${nameOf(onlyTarget)}"`
      : `${pendingDelete.length} ${noun.many}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={catalog.views.grid}
        gridLabel={label}
        allColumns={catalog.columns}
        distinctValues={catalog.distinctValues}
        counts={catalog.counts}
        error={catalog.error}
        views={catalog.views}
        commandCapabilities={catalog.commandCapabilities}
      />

      <DataGrid<CatalogColumnCtx, TNode>
        rows={catalog.gridRows}
        columns={catalog.views.grid.columns}
        allColumns={catalog.columns}
        columnCtx={{}}
        selectedId={catalog.selectedId}
        selectedIds={catalog.selectedIds}
        selectAllState={catalog.headerState}
        onToggleSelectAll={catalog.toggleSelectAll}
        onSelect={catalog.select}
        onOpenDetail={catalog.openDrawer}
        ariaLabel={label}
        rowMenu={catalog.rowMenu}
        rowLabel={(row) => nameOf(row.node)}
        enableFilters
        enableSort
        grid={catalog.views.grid}
        distinctValues={catalog.distinctValues}
        onCountsChange={catalog.setCounts}
        onNavigableIdsChange={catalog.onIdsChange}
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[0.9375rem] text-ink-muted">
            <p>No {noun.many} yet.</p>
            <p className="text-[0.8125rem] text-ink-faint">{emptyHint}</p>
          </div>
        }
      />

      {drawer}
      <ConfirmDialog
        open={pendingDelete.length > 0}
        title={
          pendingDelete.length > 1
            ? `Delete ${pendingDelete.length} ${noun.many}?`
            : `Delete this ${noun.one}?`
        }
        message={deleteMessage(deleteSubject, pendingDelete.length)}
        confirmLabel="Delete"
        destructive
        onConfirm={catalog.confirmDelete}
        onCancel={catalog.cancelDelete}
      />
    </div>
  );
}
