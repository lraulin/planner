import { describe, expect, it } from "vitest";
import { SCRAPE_BALANCE_HOLD_MS, shouldKeepScrapedBalance } from "./scrapeBalance";

const scraped = new Date("2026-08-18T16:00:00Z");
const now = scraped.getTime() + 60_000;

describe("shouldKeepScrapedBalance", () => {
  it("holds a recent scrape against a different SimpleFIN number", () => {
    expect(
      shouldKeepScrapedBalance(
        { balanceCents: -43946, scrapeBalanceAsOf: scraped },
        { balanceCents: -5978 },
        now,
      ),
    ).toBe(true);
  });

  it("lets SimpleFIN through once it matches, or once the scrape is a day old", () => {
    expect(
      shouldKeepScrapedBalance(
        { balanceCents: -43946, scrapeBalanceAsOf: scraped },
        { balanceCents: -43946 },
        now,
      ),
    ).toBe(false);

    expect(
      shouldKeepScrapedBalance(
        { balanceCents: -43946, scrapeBalanceAsOf: scraped },
        { balanceCents: -5978 },
        scraped.getTime() + SCRAPE_BALANCE_HOLD_MS,
      ),
    ).toBe(false);

    expect(
      shouldKeepScrapedBalance(
        { balanceCents: -43946, scrapeBalanceAsOf: null },
        { balanceCents: -5978 },
        now,
      ),
    ).toBe(false);
  });
});
