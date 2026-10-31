"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { DateText } from "@/components/date/DateText";
import { UrlLink } from "@/components/url/UrlLink";
import { formatUsd } from "@/lib/finances/money";
import { HOUSE_STATUS_LABELS, type HouseListRow } from "@/lib/houses/types";
import { formatDriveTime, formatMiles } from "@/lib/houses/route";
import { priorityOrderValue } from "@/lib/priority/order";
import { localDateKey } from "@/lib/schedule/geometry";
import { formatPriority } from "@/lib/tree/format";
import { formatPostalAddress } from "@/lib/address";
import { PlainTextCell, plainTextField } from "@/components/grid/PlainTextCell";

export type HousesColumnCtx = Record<string, never>;

export const HOUSES_COLUMN_IDS = [
  "priority",
  "status",
  "address",
  "price",
  "sqft",
  "beds",
  "baths",
  "pricePerSqft",
  "drive",
  "miles",
  "fence",
  "basement",
  "garage",
  "yearBuilt",
  "lotAcres",
  "hoa",
  "taxes",
  "city",
  "notes",
  "updated",
] as const;

const TRI_STATE_LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  unknown: "Unknown",
};

function triStateValue(value: boolean | null): string {
  return value === null ? "unknown" : value ? "yes" : "no";
}

function TriStateCell({ value }: { value: boolean | null }) {
  if (value === null) return null;
  return <span className="text-ink-muted">{value ? "✓" : "✗"}</span>;
}

function addressText(row: HouseListRow): string {
  return formatPostalAddress({
    streetAddress: row.streetAddress,
    city: row.city,
    region: row.state,
    postalCode: row.postalCode,
    country: "",
  });
}

/**
 * Houses are read-only in the grid; every field belongs in the drawer — including
 * priority, which elsewhere in the app is inline-editable via `LetterRankCell`. This
 * catalog is small and hand-curated like Metrics, not a working queue, so plain text
 * (as Metrics renders it) is the right fit rather than a second entry point for the
 * same value the drawer already edits.
 */
type HouseField = Pick<
  ColumnDef<HousesColumnCtx, HouseListRow>,
  "filterKind" | "filterValue" | "sortValue" | "render"
>;

/** A count or measure: filtered and sorted as a number, blank when unknown. */
function quantityField(
  value: (house: HouseListRow) => number | null,
  format: (value: number) => string = String,
): HouseField {
  return {
    filterKind: "number",
    filterValue: (row) => {
      const v = value(row.node);
      return v === null ? null : String(v);
    },
    sortValue: (row) => value(row.node),
    render: (row) => {
      const v = value(row.node);
      return (
        <span className="tabular text-[0.8125rem] text-ink-muted">
          {v === null ? "" : format(v)}
        </span>
      );
    },
  };
}

/**
 * A decimal stored as text — baths, lot acres. Filtered on the stored text, so saved
 * filters keep matching; sorted as a number.
 */
function decimalField(value: (house: HouseListRow) => string | null): HouseField {
  return {
    filterKind: "number",
    filterValue: (row) => value(row.node),
    sortValue: (row) => {
      const v = value(row.node);
      return v === null ? null : Number(v);
    },
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {value(row.node) ?? ""}
      </span>
    ),
  };
}

/** A running cost: filtered on its dollar text, sorted by cents. */
function moneyField(cents: (house: HouseListRow) => number | null): HouseField {
  return {
    filterKind: "number",
    filterValue: (row) => {
      const v = cents(row.node);
      return v === null ? null : formatUsd(v);
    },
    sortValue: (row) => cents(row.node),
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {formatUsd(cents(row.node))}
      </span>
    ),
  };
}

export const housesColumns: ColumnDef<HousesColumnCtx, HouseListRow>[] = [
  {
    id: "priority",
    label: "Pri",
    fieldLabel: "Priority",
    width: "4rem",
    align: "center",
    compact: "accent",
    filterKind: "priority",
    filterValue: (row) =>
      formatPriority(row.node.priorityLetter, row.node.priorityRank) || null,
    sortValue: (row) =>
      priorityOrderValue(row.node.priorityLetter, row.node.priorityRank),
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {formatPriority(row.node.priorityLetter, row.node.priorityRank)}
      </span>
    ),
  },
  {
    id: "status",
    label: "Status",
    width: "10rem",
    filterKind: "enum",
    filterValue: (row) => row.node.status,
    filterLabel: (value) =>
      HOUSE_STATUS_LABELS[value as keyof typeof HOUSE_STATUS_LABELS] ?? value,
    sortValue: (row) => HOUSE_STATUS_LABELS[row.node.status],
    compact: "meta",
    render: (row) => <PlainTextCell value={HOUSE_STATUS_LABELS[row.node.status]} />,
  },
  {
    id: "address",
    label: "Address",
    width: "20rem",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => addressText(row.node) || null,
    sortValue: (row) => addressText(row.node).toLowerCase(),
    compact: "primary",
    render: (row) => (
      <UrlLink
        value={row.node.listingUrl}
        className="text-[0.8125rem] font-medium text-ink"
      >
        {addressText(row.node) || row.node.nickname || "Untitled house"}
      </UrlLink>
    ),
  },
  {
    id: "price",
    label: "Price",
    width: "8rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) =>
      row.node.askingPriceCents === null ? null : formatUsd(row.node.askingPriceCents),
    sortValue: (row) => row.node.askingPriceCents,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink">
        {formatUsd(row.node.askingPriceCents)}
      </span>
    ),
  },
  {
    id: "sqft",
    label: "Sqft",
    width: "6rem",
    align: "right",
    ...quantityField(
      (house) => house.squareFeet,
      (feet) => feet.toLocaleString(),
    ),
  },
  {
    id: "beds",
    label: "Beds",
    width: "4.5rem",
    align: "right",
    ...quantityField((house) => house.beds),
  },
  {
    id: "baths",
    label: "Baths",
    width: "4.5rem",
    align: "right",
    ...decimalField((house) => house.baths),
  },
  {
    id: "pricePerSqft",
    label: "$/sqft",
    width: "6rem",
    align: "right",
    compact: "hidden",
    filterKind: "number",
    filterValue: (row) =>
      row.node.pricePerSqft === null
        ? null
        : formatUsd(Math.round(row.node.pricePerSqft * 100)),
    sortValue: (row) => row.node.pricePerSqft,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.pricePerSqft === null
          ? ""
          : formatUsd(Math.round(row.node.pricePerSqft * 100))}
      </span>
    ),
  },
  {
    id: "drive",
    label: "Drive",
    width: "6.5rem",
    align: "right",
    filterKind: "number",
    filterValue: (row) =>
      row.node.driveSeconds === null ? null : String(row.node.driveSeconds),
    sortValue: (row) => row.node.driveSeconds,
    render: (row) => (
      <span
        className="tabular text-[0.8125rem] text-ink-muted"
        title={row.node.routeError ?? undefined}
      >
        {row.node.driveSeconds === null ? "—" : formatDriveTime(row.node.driveSeconds)}
      </span>
    ),
  },
  {
    id: "miles",
    label: "Miles",
    width: "6rem",
    align: "right",
    compact: "hidden",
    filterKind: "number",
    filterValue: (row) =>
      row.node.driveMeters === null ? null : String(row.node.driveMeters),
    sortValue: (row) => row.node.driveMeters,
    render: (row) => (
      <span className="tabular text-[0.8125rem] text-ink-muted">
        {row.node.driveMeters === null ? "" : formatMiles(row.node.driveMeters)}
      </span>
    ),
  },
  {
    id: "fence",
    label: "Fence",
    width: "5rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) => triStateValue(row.node.hasFence),
    filterLabel: (value) => TRI_STATE_LABELS[value] ?? value,
    sortValue: (row) => triStateValue(row.node.hasFence),
    render: (row) => <TriStateCell value={row.node.hasFence} />,
  },
  {
    id: "basement",
    label: "Basement",
    width: "6rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) => triStateValue(row.node.hasBasement),
    filterLabel: (value) => TRI_STATE_LABELS[value] ?? value,
    sortValue: (row) => triStateValue(row.node.hasBasement),
    render: (row) => <TriStateCell value={row.node.hasBasement} />,
  },
  {
    id: "garage",
    label: "Garage",
    width: "5.5rem",
    align: "center",
    filterKind: "enum",
    filterValue: (row) => triStateValue(row.node.hasGarage),
    filterLabel: (value) => TRI_STATE_LABELS[value] ?? value,
    sortValue: (row) => triStateValue(row.node.hasGarage),
    render: (row) => <TriStateCell value={row.node.hasGarage} />,
  },
  {
    id: "yearBuilt",
    label: "Year Built",
    width: "6.5rem",
    align: "right",
    compact: "hidden",
    ...quantityField((house) => house.yearBuilt),
  },
  {
    id: "lotAcres",
    label: "Lot Acres",
    width: "6rem",
    align: "right",
    compact: "hidden",
    ...decimalField((house) => house.lotAcres),
  },
  {
    id: "hoa",
    label: "HOA",
    width: "6.5rem",
    align: "right",
    compact: "hidden",
    ...moneyField((house) => house.hoaFeeCents),
  },
  {
    id: "taxes",
    label: "Taxes",
    width: "7rem",
    align: "right",
    compact: "hidden",
    ...moneyField((house) => house.propertyTaxCents),
  },
  {
    id: "city",
    label: "City",
    width: "10rem",
    compact: "hidden",
    ...plainTextField((node) => node.city),
  },
  {
    id: "notes",
    label: "Notes",
    width: "18rem",
    compact: "hidden",
    ...plainTextField((node) => node.notes),
  },
  {
    id: "updated",
    label: "Updated",
    width: "7rem",
    compact: "hidden",
    filterKind: "date",
    filterValue: (row) => localDateKey(row.node.updatedAt),
    sortValue: (row) => row.node.updatedAt.getTime(),
    render: (row) => (
      <DateText
        dateKey={localDateKey(row.node.updatedAt)}
        className="tabular text-[0.8125rem] text-ink-muted"
      />
    ),
  },
];
