import type { ColumnDef } from "./columns";

/**
 * A record catalog's read-only text cell: one line, truncated, with the full value on hover.
 * Muted by default, because most catalog columns sit beside the row's name and read as
 * supporting detail; pass `muted={false}` for a column that is the thing being read.
 */
export function PlainTextCell({
  value,
  muted = true,
}: {
  value: string;
  muted?: boolean;
}) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={value || undefined}
    >
      {value}
    </span>
  );
}

/**
 * The filter, sort and cell of a plain text column: filtered as text, sorted
 * case-insensitively, drawn as a muted `PlainTextCell`. Spread into a column next to its
 * id, label and width.
 */
export function plainTextField<TNode>(
  value: (node: TNode) => string,
): Pick<
  ColumnDef<unknown, TNode>,
  "filterKind" | "filterValue" | "sortValue" | "render"
> {
  return {
    filterKind: "text",
    filterValue: (row) => value(row.node) || null,
    sortValue: (row) => value(row.node).toLowerCase(),
    render: (row) => <PlainTextCell value={value(row.node)} />,
  };
}
