import { describe, expect, it } from "vitest";
import { pendingMatchesPosted } from "./scrapePending";

describe("pendingMatchesPosted", () => {
  it("matches a short brand name to a feed description with a store number", () => {
    expect(
      pendingMatchesPosted(
        { description: "Chipotle", amountCents: -1691 },
        { description: "CHIPOTLE 0123 NEWPORT", amountCents: -1691 },
      ),
    ).toBe(true);
  });

  it("does not match on merchant alone when the amount changed", () => {
    // A gas hold that posts at a different total has to wait for the next scrape.
    expect(
      pendingMatchesPosted(
        { description: "Sheetz", amountCents: -100 },
        { description: "SHEETZ 456", amountCents: -3007 },
      ),
    ).toBe(false);
  });

  it("does not match a different merchant at the same amount", () => {
    expect(
      pendingMatchesPosted(
        { description: "Chipotle", amountCents: -1691 },
        { description: "Pizza Hut", amountCents: -1691 },
      ),
    ).toBe(false);
  });

  it("does not treat last month's bill as this month's pending", () => {
    expect(
      pendingMatchesPosted(
        { description: "SimpliSafe", amountCents: -3497, dateKey: "2026-08-16" },
        { description: "SIMPLISAFE", amountCents: -3497, dateKey: "2026-07-09" },
      ),
    ).toBe(false);
  });

  it("still matches a charge that posted a few days off the purchase date", () => {
    expect(
      pendingMatchesPosted(
        { description: "Chipotle", amountCents: -1691, dateKey: "2026-08-16" },
        { description: "CHIPOTLE 0123", amountCents: -1691, dateKey: "2026-08-14" },
      ),
    ).toBe(true);
  });
});
