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

  it("counts an alert hold beside the feed's on a feed account, and never on a page account", () => {
    expect(
      selectWorkingPending(
        [
          row("chase", "alert:capitalone", -1271),
          row("chase", "api:simplefin", -1059),
          row("capone", "alert:capitalone", -1271),
        ],
        accounts,
      ),
    ).toEqual([
      row("chase", "alert:capitalone", -1271),
      row("chase", "api:simplefin", -1059),
    ]);
  });
});
