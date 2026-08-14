"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import type { ResidenceGridRow } from "@/lib/residences/types";

export type ResidencesColumnCtx = Record<string, never>;

export const RESIDENCES_COLUMN_IDS = [
  "city",
  "country",
  "movedIn",
  "movedOut",
  "duration",
  "housing",
  "address",
  "landlord",
] as const;

function Text({ value, muted = true }: { value: string; muted?: boolean }) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={value || undefined}
    >
      {value}
    </span>
  );
}

/** Residences are read-only in the grid; the full address belongs in the drawer. */
export const residencesColumns: ColumnDef<ResidencesColumnCtx, ResidenceGridRow>[] = [
  {
    id: "city",
    label: "City",
    width: "minmax(9rem,0.9fr)",
    hideable: false,
    filterKind: "text",
    // The label is the fallback identity for a place with no city — a cabin, a boat.
    filterValue: (row) => row.node.city || row.node.label || null,
    sortValue: (row) => (row.node.city || row.node.label).toLowerCase(),
    compact: "primary",
    render: (row) => (
      <span className="truncate text-[0.8125rem] font-medium text-ink">
        {row.node.city || row.node.label}
      </span>
    ),
  },
  {
    id: "country",
    label: "Country",
    width: "minmax(8rem,0.7fr)",
    filterKind: "text",
    filterValue: (row) => row.node.country || null,
    sortValue: (row) => row.node.country.toLowerCase(),
    compact: "meta",
    render: (row) => <Text value={row.node.country} />,
  },
  {
    id: "movedIn",
    label: "Moved in",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => row.node.movedIn,
    sortValue: (row) => row.node.movedIn,
    compact: "meta",
    render: (row) => (
      <DateText
        dateKey={row.node.movedIn ?? ""}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  },
  {
    id: "movedOut",
    label: "Moved out",
    width: "7rem",
    filterKind: "date",
    filterValue: (row) => row.node.movedOut,
    sortValue: (row) => row.node.movedOut,
    compact: "hidden",
    // Blank on a dated residence means you still live there — see the Jobs "Ended" column.
    render: (row) =>
      row.node.movedOut ? (
        <DateText
          dateKey={row.node.movedOut}
          className="tabular text-[0.8125rem] text-ink-muted"
        />
      ) : row.node.duration.ongoing ? (
        <span className="text-[0.8125rem] text-ink-faint">Current</span>
      ) : null,
  },
  {
    id: "duration",
    label: "Lived there",
    width: "7.5rem",
    align: "right",
    // Sorts on days, not on a date — see the same column on Jobs.
    sortValue: (row) => row.node.duration.days,
    compact: "hidden",
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.duration.text ?? ""}
      </span>
    ),
  },
  {
    id: "housing",
    label: "Housing",
    width: "7.5rem",
    filterKind: "text",
    filterValue: (row) => row.node.housingType || null,
    sortValue: (row) => row.node.housingType.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.housingType} />,
  },
  {
    id: "address",
    label: "Address",
    width: "minmax(12rem,1.3fr)",
    filterKind: "text",
    filterValue: (row) => row.node.address || null,
    sortValue: (row) => row.node.address.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.address} />,
  },
  {
    id: "landlord",
    label: "Landlord",
    width: "minmax(9rem,0.8fr)",
    filterKind: "text",
    filterValue: (row) => row.node.landlordName || null,
    sortValue: (row) => row.node.landlordName.toLowerCase(),
    compact: "hidden",
    render: (row) => <Text value={row.node.landlordName} />,
  },
];
