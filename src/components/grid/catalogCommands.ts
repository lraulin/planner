"use client";

import { DELETE_ROW, INSERT_AFTER, OPEN_RECORD } from "@/lib/commands/chords";
import type { GridCommandCapabilities, GridPageCommand } from "@/lib/grid/commandDeck";

/**
 * The command set for a **flat catalog** grid: Contacts, Resources, Time Charts.
 *
 * Three views with the same three verbs — make one, open one, delete one — and, before this, three
 * copies of the same capabilities block plus three hand-written row menus. They had already drifted:
 * one printed `New Time Chart` where its own toolbar said `New time chart`, and each spelled out
 * its own create / open / delete shortcuts again beside the labels.
 *
 * Only the nouns differ, so only the nouns are arguments.
 */
/** Rows a catalog plural verb should act on: the selection, or the right-clicked row. */
export function catalogTargetIds(
  rowId: string | null,
  count: number,
  selectedIds: ReadonlySet<string>,
  order: readonly string[],
): string[] {
  if (count > 1) return order.filter((id) => selectedIds.has(id));
  return rowId ? [rowId] : [];
}

export function catalogCapabilities({
  createLabel,
  openLabel,
  deleteLabel = "Delete",
  deleteDisabled,
  openDisabled,
  selection,
  onCreate,
  onOpen,
  onDelete,
  onSelectAll,
  pageCommands = [],
}: {
  /** e.g. `"New contact"`. */
  createLabel: string;
  /** e.g. `"Open contact"` — Time Charts says `"Edit areas"`, which is what it really does. */
  openLabel: string;
  deleteLabel?: string;
  /** Why the selected record cannot be deleted, when the domain owns that constraint. */
  deleteDisabled?: string;
  /**
   * Why the selected record cannot be opened. Rare — most catalogs open everything — but
   * Timeline has rows that edit in the grid and have no record to open.
   */
  openDisabled?: string;
  selection: {
    id: string | null;
    count: number;
    label?: string | null;
    /** Rows a plural Delete acts on. Absent means just `id`. */
    ids?: readonly string[];
  };
  onCreate: () => void;
  onOpen: (id: string) => void;
  onDelete: (ids: readonly string[]) => void;
  /** Select every currently navigable row. Header checkbox and ⌘A. */
  onSelectAll?: () => void;
  /** Anything this catalog has beyond the three verbs. */
  pageCommands?: readonly GridPageCommand[];
}): GridCommandCapabilities {
  const noRow = selection.id === null ? "Select a row first" : undefined;
  /**
   * Open needs a row and nothing more. Delete needs a row *and* the domain's permission —
   * `deleteDisabled` is the reason the record cannot be removed from here.
   *
   * These two were swapped: `record.open` was gated on `cannotDelete` and `record.delete`
   * ignored `deleteDisabled` entirely. Contacts is the caller that shows what that cost —
   * a Google-synced contact could not be opened at all, and could be deleted despite the
   * message saying to delete it in Google. The variable was even named `cannotDelete`.
   */
  const cannotDelete = noRow ?? deleteDisabled;
  const cannotOpen = noRow ?? openDisabled;

  return {
    selection,
    actions: { onSelectAll },
    pageCommands: [
      {
        id: "grid.create",
        label: createLabel,
        group: "record",
        menu: "new",
        section: "New",
        icon: "new",
        toolbar: 10,
        // The one row-menu command that does not need a row, and therefore the only thing worth
        // opening the blank-area menu for on an empty catalog. See `buildGridCommands`.
        rowMenu: true,
        bindings: INSERT_AFTER,
        run: onCreate,
      },
      {
        id: "record.open",
        label: openLabel,
        group: "record",
        menu: "item",
        section: "Item",
        icon: "open",
        toolbar: 50,
        rowMenu: true,
        bindings: OPEN_RECORD,
        disabled: Boolean(cannotOpen),
        title: cannotOpen,
        run: () => selection.id && onOpen(selection.id),
      },
      {
        id: "record.delete",
        label: deleteLabel,
        group: "record",
        menu: "item",
        section: "Danger",
        icon: "delete",
        rowMenu: true,
        destructive: true,
        bindings: DELETE_ROW,
        disabled: Boolean(cannotDelete),
        title: cannotDelete,
        run: () => {
          const ids = selection.ids ?? (selection.id ? [selection.id] : []);
          if (ids.length > 0) onDelete(ids);
        },
      },
      ...pageCommands,
    ],
  };
}
