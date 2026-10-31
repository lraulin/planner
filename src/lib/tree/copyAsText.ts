/**
 * Format selected outline (or list) rows as plain indented text for the clipboard.
 *
 * Relative depth: the shallowest selected row becomes flush left, so pasting a mid-tree
 * chunk into a note or another app does not inherit the whole outline's indent. Display
 * order is the caller's — usually the navigable rows on screen.
 */

export type CopyableRow = {
  id: string;
  name: string;
  /** Tree / display depth; only differences between selected rows matter. */
  depth: number;
};

export function copyAsText(
  rows: readonly CopyableRow[],
  selectedIds: ReadonlySet<string>,
): string {
  const selected = rows.filter((row) => selectedIds.has(row.id));
  if (selected.length === 0) return "";

  const minDepth = Math.min(...selected.map((row) => row.depth));
  return selected
    .map((row) => {
      const indent = "  ".repeat(Math.max(0, row.depth - minDepth));
      const name = row.name.trim() || "Untitled";
      return `${indent}${name}`;
    })
    .join("\n");
}

/** A flat list's selection as text, one line per selected item in display `order`. */
export function flatSelectionText<T extends { id: string }>(
  order: readonly string[],
  items: readonly T[],
  selectedIds: ReadonlySet<string>,
  nameOf: (item: T) => string,
): string {
  const byId = new Map(items.map((item) => [item.id, item]));
  const rows = order.flatMap((id) => {
    const item = byId.get(id);
    return item ? [{ id, name: nameOf(item), depth: 0 }] : [];
  });
  return copyAsText(rows, selectedIds);
}

/** Write plain text to the clipboard; returns whether the write was attempted. */
export async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
