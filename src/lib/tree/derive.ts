import { laterShelf, ownShelf, type Shelf } from "./shelving";
import type { OutlineNode, OutlineRow } from "./types";

/**
 * Computes everything the outline shows that is not stored: inherited priority (L.A.P.),
 * effort rollups, child counts, and which rows are hidden under a collapsed ancestor.
 *
 * Kept free of database access so it can be tested directly.
 *
 * `rows` must arrive in depth-first order, parents before their children — which is what
 * ordering by the accumulated sort-key path produces.
 */
export function derive(rows: OutlineRow[]): OutlineNode[] {
  const byId = new Map<string, OutlineRow>();
  const childIds = new Map<string, string[]>();

  for (const row of rows) {
    byId.set(row.id, row);
    if (row.parentId) {
      const siblings = childIds.get(row.parentId);
      if (siblings) siblings.push(row.id);
      else childIds.set(row.parentId, [row.id]);
    }
  }

  // Inherited priority: walk up until a node carries one. Memoized, so a deep tree costs
  // one pass rather than one walk per node.
  const lapCache = new Map<
    string,
    { letter: OutlineRow["priorityLetter"]; rank: number | null }
  >();

  function lapFor(id: string): {
    letter: OutlineRow["priorityLetter"];
    rank: number | null;
  } {
    const cached = lapCache.get(id);
    if (cached) return cached;

    const row = byId.get(id)!;
    const result =
      row.priorityLetter !== null
        ? { letter: row.priorityLetter, rank: row.priorityRank }
        : row.parentId && byId.has(row.parentId)
          ? lapFor(row.parentId)
          : { letter: null, rank: null };

    lapCache.set(id, result);
    return result;
  }

  /**
   * Inherited category — the same walk again. Only Result Areas are given one in practice,
   * but the rule is written against the field rather than the type, so category behaves
   * like every other inherited property instead of needing a special case wherever it is
   * read.
   */
  const categoryCache = new Map<string, string | null>();

  function categoryFor(id: string): string | null {
    const cached = categoryCache.get(id);
    if (cached !== undefined) return cached;

    const row = byId.get(id)!;
    const own = row.category?.trim();
    const result = own
      ? own
      : row.parentId && byId.has(row.parentId)
        ? categoryFor(row.parentId)
        : null;

    categoryCache.set(id, result);
    return result;
  }

  // Inherited shelving, the same walk as `lapFor` and for the same reason: deferring a
  // project takes its subtree with it, and the shelf is *inherited* rather than copied onto
  // the children — copying breaks on re-parenting, cannot be undone, and would drift as each
  // child's own recurrence rewrote its `deferred_date`. Latest wins, indefinite beats any
  // date; expiry is applied by the reader, which is why no `today` is needed here.
  const shelfCache = new Map<string, Shelf | null>();

  function shelfFor(id: string): Shelf | null {
    const cached = shelfCache.get(id);
    if (cached !== undefined) return cached;

    const row = byId.get(id)!;
    const inherited =
      row.parentId && byId.has(row.parentId) ? shelfFor(row.parentId) : null;
    const result = laterShelf(ownShelf(row), inherited);

    shelfCache.set(id, result);
    return result;
  }

  // Rollups are post-order, so walk the rows backwards: children always come after their
  // parent in depth-first order, so by the time we reach a parent its children are done.
  const rollups = new Map<
    string,
    {
      effort: number | null;
      effortLeft: number | null;
      actual: number;
      weighted: number;
    }
  >();

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const children = childIds.get(row.id) ?? [];

    if (children.length === 0) {
      const effort = row.effortMinutes;
      rollups.set(row.id, {
        effort,
        effortLeft: row.effortLeftMinutes,
        actual: row.actualEffortMinutes ?? 0,
        weighted: (effort ?? 0) * (row.percentComplete ?? 0),
      });
      continue;
    }

    let effort: number | null = null;
    let effortLeft: number | null = null;
    let actual = row.actualEffortMinutes ?? 0;
    let weighted = 0;

    for (const childId of children) {
      const child = rollups.get(childId)!;
      if (child.effort !== null) effort = (effort ?? 0) + child.effort;
      if (child.effortLeft !== null) effortLeft = (effortLeft ?? 0) + child.effortLeft;
      actual += child.actual;
      weighted += child.weighted;
    }

    rollups.set(row.id, { effort, effortLeft, actual, weighted });
  }

  // A row is hidden when any ancestor is collapsed. Parents precede children, so a single
  // forward pass suffices.
  const hiddenById = new Map<string, boolean>();

  return rows.map((row) => {
    const parentHidden = row.parentId
      ? (hiddenById.get(row.parentId) ?? false) ||
        (byId.get(row.parentId)?.collapsed ?? false)
      : false;
    hiddenById.set(row.id, parentHidden);

    const lap = lapFor(row.id);
    const rollup = rollups.get(row.id)!;
    const children = childIds.get(row.id) ?? [];

    return {
      ...row,
      lapLetter: lap.letter,
      lapRank: lap.rank,
      effectiveCategory: categoryFor(row.id),
      effortRollupMinutes: rollup.effort,
      effortLeftRollupMinutes: rollup.effortLeft,
      actualEffortRollupMinutes: rollup.actual,
      percentCompleteRollup:
        rollup.effort && rollup.effort > 0
          ? Math.round(rollup.weighted / rollup.effort)
          : 0,
      childCount: children.length,
      hasChildren: children.length > 0,
      hasActiveChildren: children.some((id) => {
        const child = byId.get(id)!;
        return child.state !== "completed" && child.state !== "cancelled";
      }),
      hidden: parentHidden,
      shelf: shelfFor(row.id),
    };
  });
}
