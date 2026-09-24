import { describe, expect, it } from "vitest";
import { selectWorkingPending } from "./workingPending";

function row(
  accountId: string,
  source: string,
  amountCents: number,
): { accountId: string; source: string; amountCents: number } {
  return { accountId, source, amountCents };
}

const accounts = [
  { id: "capone", historySource: "bank_page" },
  { id: "chase", historySource: "simplefin" },
];

describe("selectWorkingPending", () => {
  it("counts only the page's holds on a bank-page account and only the feed's elsewhere", () => {
    expect(
      selectWorkingPending(
        [
          row("capone", "scrape:capitalone", -5000),
          row("capone", "api:simplefin", -5000),
          row("chase", "api:simplefin", -1059),
          row("chase", "scrape:chase", -1059),
        ],
        accounts,
      ),
    ).toEqual([
      row("capone", "scrape:capitalone", -5000),
      row("chase", "api:simplefin", -1059),
    ]);
  });

  it("does not depend on when anything was captured: a page hold with no capture stamp counts", () => {
    // The old rule dropped this row until a capture newer than the feed's balance existed,
    // so an envelope carried onto the page's hold at cutover vanished from the budget.
    expect(
      selectWorkingPending([row("capone", "scrape:capitalone", -5000)], accounts),
    ).toHaveLength(1);
  });
});
