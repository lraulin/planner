"use client";

import type { PriorityLetter } from "@/db/schema";
import { LetterRankCell } from "@/components/grid/LetterRankCell";
import type { OutlineNode } from "@/lib/tree/types";

/**
 * The **TC Priority** cell — the Task Chooser's own flat ranking, edited by typing.
 *
 * The input rules live in `src/components/grid/LetterRankCell.tsx`, shared with the Day
 * tab's daily ABC; the placement rules live in `src/lib/chooser/tcPriority.ts`. This binds
 * the two to the node's TC fields.
 */
export function TcPriorityCell({
  node,
  onAssign,
}: {
  node: OutlineNode;
  /** `letter === null` clears the ranking; `rank === null` means "end of that letter". */
  onAssign: (letter: PriorityLetter | null, rank: number | null) => void;
}) {
  return (
    <LetterRankCell
      letter={node.tcPriorityLetter}
      rank={node.tcPriorityRank}
      onAssign={onAssign}
      ariaLabel="Task Chooser priority — A, B, C or D, with an optional position"
    />
  );
}
