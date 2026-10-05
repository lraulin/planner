import { descendantEnvelopeIds } from "../budget/hierarchy";
import type { BudgetCategoryRow, BudgetGroupRow } from "../budget/queries";
import { averageOver, type SpendingActuals } from "./actuals";

/**
 * The spending a scenario does not account for.
 *
 * "Uncovered" is a living-scope envelope that had spending in the window and that nothing in
 * the scenario references. The scenario references an envelope when it is a bill — switched
 * on **or off**, since a bill switched off is accounted for, not forgotten — or when a line
 * links it directly or through a budget group.
 *
 * Double counting is not looked for. Chewy can be a bill while cat food is a Supplies line;
 * the actuals column is how that shows, and the page does not guess.
 */
export type UncoveredEnvelope = {
  envelopeId: string;
  name: string;
  /** Average monthly spend over the completed months in the window. */
  monthlyCents: number;
};

export function uncoveredEnvelopes(input: {
  categories: readonly Pick<BudgetCategoryRow, "id" | "name" | "kind" | "groupId">[];
  groups: readonly Pick<BudgetGroupRow, "id" | "parentGroupId">[];
  actuals: SpendingActuals;
  /** Every bill envelope, whatever its switch. */
  billEnvelopeIds: ReadonlySet<string>;
  /** The `envelopeId` / `budgetGroupId` links on the scenario's lines. */
  linkedEnvelopeIds: ReadonlySet<string>;
  linkedGroupIds: ReadonlySet<string>;
}): UncoveredEnvelope[] {
  const covered = new Set<string>([
    ...input.billEnvelopeIds,
    ...input.linkedEnvelopeIds,
  ]);
  for (const groupId of input.linkedGroupIds) {
    for (const id of descendantEnvelopeIds(input.groups, input.categories, groupId)) {
      covered.add(id);
    }
  }

  return input.categories
    .filter((category) => category.kind === "spending" && !covered.has(category.id))
    .flatMap((category) => {
      const monthlyCents = averageOver(input.actuals, [category.id]) ?? 0;
      return monthlyCents > 0
        ? [{ envelopeId: category.id, name: category.name, monthlyCents }]
        : [];
    })
    .sort(
      (a, b) =>
        b.monthlyCents - a.monthlyCents ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}
