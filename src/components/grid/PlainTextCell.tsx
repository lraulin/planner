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
