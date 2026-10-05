import type { UncoveredEnvelope } from "./uncovered";

/**
 * The lines "Add lines from last year's spending" proposes: one manual, monthly line per
 * uncovered spending envelope, linked to that envelope and prefilled with its average.
 *
 * It is the uncovered list turned into rows, on purpose — seeding and the Uncovered footer
 * are the same question ("what did I spend that this scenario ignores?") and share its
 * answer, so seeding a scenario leaves the footer empty.
 */
export type SeedLine = {
  name: string;
  amountCents: number;
  envelopeId: string;
};

export function seedLines(uncovered: readonly UncoveredEnvelope[]): SeedLine[] {
  return uncovered.map((row) => ({
    name: row.name,
    amountCents: row.monthlyCents,
    envelopeId: row.envelopeId,
  }));
}
