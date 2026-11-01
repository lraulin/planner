"use client";

import { MergePickerDialog } from "@/components/finances/MergePickerDialog";
import type { SupplyItemRow } from "@/lib/finances/supplies/queries";

/** Searchable path for choosing the items a merge will consolidate, when a phone cannot Shift-click. */
export function SupplyMergePickerDialog({
  items,
  initiallySelected,
  onClose,
  onContinue,
}: {
  items: readonly SupplyItemRow[];
  initiallySelected: ReadonlySet<string>;
  onClose: () => void;
  onContinue: (items: SupplyItemRow[]) => void;
}) {
  return (
    <MergePickerDialog
      records={items}
      initiallySelected={initiallySelected}
      title="Select items to merge"
      description="Choose at least two items. You will choose the survivor and review every moved offer next."
      placeholder="Search items…"
      emptyText="No items match that search."
      detail={(item) =>
        `${item.groupLabel || "Ungrouped"}${
          item.options.length > 0
            ? ` · ${item.options.length} offer${item.options.length === 1 ? "" : "s"}`
            : ""
        }`
      }
      onClose={onClose}
      onContinue={onContinue}
    />
  );
}
