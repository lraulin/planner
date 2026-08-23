import { describe, expect, it } from "vitest";

import { aliasFor, payeeForDescription, payeeIndex } from "./resolve";

describe("payeeIndex", () => {
  it("maps each alias to its payee", () => {
    const index = payeeIndex([
      { alias: "WM SUPERCENTER", payeeId: "walmart" },
      { alias: "WAL-MART", payeeId: "walmart" },
      { alias: "STEAM", payeeId: "steam" },
    ]);

    expect(index.get("WM SUPERCENTER")).toBe("walmart");
    expect(index.get("WAL-MART")).toBe("walmart");
    expect(index.get("STEAM")).toBe("steam");
  });

  it("ignores a blank alias, which would otherwise claim every unnamed row", () => {
    const index = payeeIndex([{ alias: "", payeeId: "greedy" }]);

    expect(index.size).toBe(0);
    expect(payeeForDescription("Withdrawal from ", index)).toBeNull();
  });
});

describe("payeeForDescription", () => {
  const index = payeeIndex([
    { alias: "WM SUPERCENTER", payeeId: "walmart" },
    { alias: "BLUE BOTTLE COFFEE", payeeId: "bluebottle" },
  ]);

  it("resolves through the same normalization the seed planner used", () => {
    expect(payeeForDescription("WM SUPERCENTER #1981", index)).toBe("walmart");
  });

  it("returns null for a merchant no payee claims yet", () => {
    // Not a failure: reclassify mints a payee for it, which is what keeps payee_id
    // recomputable rather than something a backfill has to guess at.
    expect(payeeForDescription("NEW SHOP #4", index)).toBeNull();
  });

  it("resolves a bare processor line through the counterparty that names it", () => {
    // "PAYPAL *" normalizes to nothing at all, so without the counterparty this row could
    // never reach a payee — and every such row would look identical to every other.
    expect(aliasFor("PAYPAL *")).toBe("");
    expect(payeeForDescription("PAYPAL *", index, "Blue Bottle Coffee")).toBe(
      "bluebottle",
    );
  });

  it("falls back to the description when the counterparty names nothing", () => {
    // A blank or unusable counterparty must not erase a merchant the bank did name.
    expect(payeeForDescription("WM SUPERCENTER #1981", index, "")).toBe("walmart");
    expect(payeeForDescription("WM SUPERCENTER #1981", index, "PAYPAL *")).toBe(
      "walmart",
    );
  });
});
