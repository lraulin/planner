import { sourceColumns, type LineAmountSource, type LineSourceColumns } from "./amount";

/**
 * Adding the first sub-line to a leaf. **Splitting never changes the total**: the parent's
 * amount moves onto the new child and the parent becomes a roll-up that shows the sum.
 *
 * Without this, a $250 line given a $0 sub-line would silently become a $0 line.
 */
export type SplitPlan = {
  /** What the new sub-line is created with. */
  child: LineSourceColumns;
  /** What the parent is rewritten to — no source of its own. */
  parent: LineSourceColumns;
};

export function splitLine(parentSource: LineAmountSource): SplitPlan {
  return {
    child: sourceColumns(parentSource),
    parent: sourceColumns({ type: "none" }),
  };
}
