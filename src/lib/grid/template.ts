/**
 * The grid's track model: every column is a definite width, and the one elastic track is a
 * filler at the far right.
 *
 * This is what makes a resize local. When a column in the middle of the layout was the
 * elastic one, the pixels a drag added to the dragged column came out of *it* — so the
 * boundary under the cursor stayed put and a boundary somewhere else moved the opposite
 * way. Dragging the Group column's right edge 100px right left that edge exactly where it
 * was and pulled the Bill column's right edge 100px left instead. Slack that lives at the
 * end can only be taken from the end, so the grabbed boundary follows the pointer and
 * nothing to its left moves at all — which is what every desktop grid does, and what
 * Achieve Planner's manual describes ("drag to the new size").
 */

import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from "@/lib/settings/grid";

/** A column, as far as the layout is concerned. */
export type TrackColumn = { id: string; width: string };

/**
 * The trailing track. `minmax(0,1fr)` rather than `1fr`: when the columns outgrow the
 * container there is no slack to hold, and the filler has to be allowed to vanish so the
 * grid can overflow and scroll rather than squeezing the columns.
 */
export const FILLER_TRACK = "minmax(0,1fr)";

/**
 * CSS `grid-template-columns` for the visible set, filler included.
 *
 * A stored override wins over the column's declared track. Overrides are pixel numbers
 * rather than free-text CSS: they come from a drag, and from a settings blob anyone can
 * edit in devtools, so the one thing they must not be able to do is inject a track
 * expression into the layout.
 */
export function buildGridTemplate(
  columns: readonly TrackColumn[],
  widths?: Record<string, number>,
): string {
  return [...columns.map((column) => resolvedTrack(column, widths)), FILLER_TRACK].join(
    " ",
  );
}

/**
 * The track a column actually lays out as: a stored override wins over the declared width.
 *
 * One function because two callers need the answer — the template and the tree drop
 * indicator's offset — and the indicator having its own copy that read only the *declared*
 * width is why the drop line landed in the wrong place as soon as any column before the name
 * had been resized.
 */
function resolvedTrack(column: TrackColumn, widths?: Record<string, number>): string {
  const override = widths?.[column.id];
  return override === undefined ? definiteTrack(column.width) : `${override}px`;
}

/**
 * Where the name column's text starts, as a CSS length — the offset the tree drop line and
 * the child-drop marker indent from.
 *
 * The handle track, then every track before the name column, each followed by the cell gap.
 * Indentation lives inside the name cell, so an indicator that marks depth has to begin
 * where that cell's content does. A track that is not a plain length (nothing declares one
 * now, but a `minmax` would collapse to something this cannot add up) gives up and measures
 * from the row edge rather than guessing.
 */
export function nameColumnOffset(
  columns: readonly TrackColumn[],
  handleWidth: string,
  gap: string,
  widths?: Record<string, number>,
): string {
  const parts = [handleWidth, gap];
  for (const column of columns) {
    if (column.id === "name") break;
    const track = resolvedTrack(column, widths);
    if (!/^[\d.]+(rem|px|em)$/.test(track)) return `calc(${handleWidth} + ${gap})`;
    parts.push(track, gap);
  }
  return `calc(${parts.join(" + ")})`;
}

/**
 * A declared width as a definite track: `minmax(a,b)` contributes `a`.
 *
 * Nothing in the app declares a `minmax` any more, but a second flexible track is the one
 * mistake that brings the resize bug back — it would take the slack the filler exists to
 * hold, from wherever in the row that column happens to sit. Collapsing it here means a
 * column added with the old shape lays out narrow, not sideways.
 */
function definiteTrack(width: string): string {
  const minmax = /^minmax\(\s*([^,]+?)\s*,[^)]*\)$/.exec(width);
  return minmax ? minmax[1] : width;
}

/**
 * The width a resize drag lands on. Measured from the column's width at pointer-down plus
 * the distance travelled, rather than accumulated per move, so a drag that outruns the
 * pointer still ends up where the cursor is.
 */
export function resizedColumnWidth(startWidth: number, deltaX: number): number {
  return Math.min(
    MAX_COLUMN_WIDTH,
    Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + deltaX)),
  );
}
