/**
 * Which columns survive the trip to a phone.
 *
 * A compact row has three slots and a desktop grid has up to thirteen columns, so something
 * has to choose. Each column may declare a `compact` role; anything that does not is placed
 * by the defaults below, so no grid is *required* to opt in and a new column does not silently
 * vanish from the phone.
 *
 * This lives in `src/lib` rather than in the component because it is the part that can be
 * quietly wrong — a wrong cap or a mis-picked primary looks entirely plausible in review and
 * only shows up as "why is the title missing on my phone".
 */

export type CompactRole = "primary" | "accent" | "meta" | "hidden";

/** Columns whose id means "this is the row's title", in preference order. */
const PRIMARY_IDS = ["name", "title", "subject"];

/** Columns whose id means "this is the row's priority", in preference order. */
const ACCENT_IDS = ["priority", "tcPriority", "letter", "abc"];

/** How many meta chips fit on one line at 390px before they start eliding. */
export const DEFAULT_MAX_META = 3;

export type CompactColumn = { id: string; compact?: CompactRole };

export type CompactFields<C> = {
  primary: C | null;
  accent: C | null;
  meta: C[];
};

/**
 * Split visible columns into the compact row's slots.
 *
 * Explicit roles always win. Where none is declared:
 *
 * - the first `name` / `title` / `subject` column is the **primary** (the title line);
 * - the first `priority`-like column is the **accent** (the colour bar);
 * - the next few remaining columns become **meta** chips, in declared order;
 * - anything past the cap is dropped — it is still one tap away in the record sheet.
 *
 * With no recognisable title column the first column becomes primary regardless of its id,
 * because a row with no title line is not a row.
 */
export function resolveCompactFields<C extends CompactColumn>(
  columns: readonly C[],
  options?: { maxMeta?: number },
): CompactFields<C> {
  const maxMeta = options?.maxMeta ?? DEFAULT_MAX_META;

  const declared = (role: CompactRole) =>
    columns.find((column) => column.compact === role) ?? null;

  const byId = (ids: string[]) => {
    for (const id of ids) {
      const match = columns.find(
        (column) => column.id === id && column.compact === undefined,
      );
      if (match) return match;
    }
    return null;
  };

  let primary = declared("primary") ?? byId(PRIMARY_IDS);
  const accent = declared("accent") ?? byId(ACCENT_IDS);

  // No title column of any recognisable name: take the first thing that is not the accent
  // and not explicitly excluded, so the row still says what it is.
  primary ??=
    columns.find((column) => column.compact !== "hidden" && column.id !== accent?.id) ??
    null;

  const meta: C[] = [];
  for (const column of columns) {
    if (column.id === primary?.id || column.id === accent?.id) continue;
    if (column.compact === "hidden") continue;
    // A second column explicitly marked `primary` or `accent` lost the slot above; it falls
    // through to meta rather than disappearing.
    if (meta.length >= maxMeta) break;
    meta.push(column);
  }

  return { primary, accent, meta };
}
