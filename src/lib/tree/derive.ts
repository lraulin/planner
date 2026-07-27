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
      effortRollupMinutes: rollup.effort,
      effortLeftRollupMinutes: rollup.effortLeft,
      actualEffortRollupMinutes: rollup.actual,
      percentCompleteRollup:
        rollup.effort && rollup.effort > 0
          ? Math.round(rollup.weighted / rollup.effort)
          : 0,
      childCount: children.length,
      hasChildren: children.length > 0,
      hidden: parentHidden,
    };
  });
}
