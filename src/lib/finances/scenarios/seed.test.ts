import { describe, expect, it } from "vitest";
import { seedLines } from "./seed";

describe("seedLines", () => {
  it("proposes one line per uncovered envelope, prefilled with its average", () => {
    expect(
      seedLines([
        { envelopeId: "groceries", name: "Groceries", monthlyCents: 61250 },
        { envelopeId: "fun", name: "Fun", monthlyCents: 9000 },
      ]),
    ).toEqual([
      { name: "Groceries", amountCents: 61250, envelopeId: "groceries" },
      { name: "Fun", amountCents: 9000, envelopeId: "fun" },
    ]);
  });

  it("proposes nothing when nothing is uncovered", () => {
    expect(seedLines([])).toEqual([]);
  });
});
