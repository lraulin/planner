import { describe, expect, it } from "vitest";
import { SCRAPE_BALANCE_HOLD_MS } from "@/lib/banksync/scrapeBalance";
import { selectWorkingPending } from "./workingPending";

const NOW = Date.parse("2026-08-18T16:00:00Z");

function row(
  accountId: string,
  source: string,
  amountCents: number,
): { accountId: string; source: string; amountCents: number } {
  return { accountId, source, amountCents };
}

describe("selectWorkingPending", () => {
  it("keeps SimpleFIN pending when no scrape has landed", () => {
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905)],
        [{ id: "chase", scrapeBalanceAsOf: null }],
        NOW,
      ),
    ).toEqual([row("chase", "api:simplefin", -5905)]);
  });

  it("drops SimpleFIN pending on an account that has scrape rows", () => {
    const selected = selectWorkingPending(
      [
        row("chase", "api:simplefin", -5905),
        row("chase", "scrape:chase", -2284),
        row("capone", "scrape:capitalone", -1691),
      ],
      [
        { id: "chase", scrapeBalanceAsOf: new Date(NOW) },
        { id: "capone", scrapeBalanceAsOf: null },
      ],
      NOW,
    );
    expect(selected).toEqual([
      row("chase", "scrape:chase", -2284),
      row("capone", "scrape:capitalone", -1691),
    ]);
  });

  it("treats an empty scrape inside the hold as no pending", () => {
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905)],
        [{ id: "chase", scrapeBalanceAsOf: new Date(NOW - 60_000) }],
        NOW,
      ),
    ).toEqual([]);
  });

  it("returns SimpleFIN pending once the scrape hold expires", () => {
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905)],
        [
          {
            id: "chase",
            scrapeBalanceAsOf: new Date(NOW - SCRAPE_BALANCE_HOLD_MS - 1),
          },
        ],
        NOW,
      ),
    ).toEqual([row("chase", "api:simplefin", -5905)]);
  });
});
