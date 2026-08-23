import { describe, expect, it } from "vitest";

import { distributeRemainder } from "./remainder";

describe("distributeRemainder", () => {
  it("gives leftover Ready to Assign to a single remainder envelope", () => {
    const shares = distributeRemainder([{ envelopeId: "savings", weight: 1 }], 88812);
    expect(shares.get("savings")).toBe(88812);
  });

  it("assigns nothing when leftover is zero or negative — remainder never drives RTA negative", () => {
    expect(
      distributeRemainder([{ envelopeId: "savings", weight: 1 }], 0).get("savings"),
    ).toBe(0);
    expect(
      distributeRemainder([{ envelopeId: "savings", weight: 1 }], -500).get("savings"),
    ).toBe(0);
  });

  it("splits by weight and lets the last line absorb the rounding cent", () => {
    const shares = distributeRemainder(
      [
        { envelopeId: "a", weight: 1 },
        { envelopeId: "b", weight: 1 },
      ],
      10001,
    );
    expect((shares.get("a") ?? 0) + (shares.get("b") ?? 0)).toBe(10001);
    expect(shares.get("a")).toBe(5001);
    expect(shares.get("b")).toBe(5000);
  });
});
