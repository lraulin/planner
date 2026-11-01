"use client";

import { MergePickerDialog } from "@/components/finances/MergePickerDialog";
import type { PayeeRow } from "@/lib/finances/payees/queries";

/** Searchable path for choosing the identities a merge will consolidate. */
export function PayeeMergePickerDialog({
  payees,
  initiallySelected,
  onClose,
  onContinue,
}: {
  payees: readonly PayeeRow[];
  initiallySelected: ReadonlySet<string>;
  onClose: () => void;
  onContinue: (payees: PayeeRow[]) => void;
}) {
  return (
    <MergePickerDialog
      records={payees}
      initiallySelected={initiallySelected}
      title="Select payees to merge"
      description="Choose at least two duplicate identities. You will choose the survivor and review every moved reference next."
      placeholder="Search names or bank spellings…"
      emptyText="No payees match that search."
      matches={(payee, needle) =>
        payee.aliases.some((alias) => alias.toLocaleLowerCase().includes(needle))
      }
      detail={(payee) => payee.aliases.join(", ") || "No bank spellings"}
      onClose={onClose}
      onContinue={onContinue}
    />
  );
}
