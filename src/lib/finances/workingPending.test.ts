import { describe, expect, it } from "vitest";
import { BROWSER_PENDING_AUTHORITY_MS } from "./browserPendingAuthority";
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
        [{ id: "chase", browserPendingAsOf: null }],
        NOW,
      ),
    ).toEqual([row("chase", "api:simplefin", -5905)]);
  });

  it("uses only browser pending while that account's snapshot is authoritative", () => {
    const selected = selectWorkingPending(
      [
        row("chase", "api:simplefin", -5905),
        row("chase", "scrape:chase", -2284),
        row("capone", "scrape:capitalone", -1691),
      ],
      [
        { id: "chase", browserPendingAsOf: new Date(NOW) },
        { id: "capone", browserPendingAsOf: null },
      ],
      NOW,
    );
    expect(selected).toEqual([row("chase", "scrape:chase", -2284)]);
  });

  it("treats an empty scrape inside the hold as no pending", () => {
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905)],
        [{ id: "chase", browserPendingAsOf: new Date(NOW - 60_000) }],
        NOW,
      ),
    ).toEqual([]);
  });

  it("excludes stale browser pending and resumes SimpleFIN after expiry", () => {
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905), row("chase", "scrape:chase", -2284)],
        [
          {
            id: "chase",
            browserPendingAsOf: new Date(NOW - BROWSER_PENDING_AUTHORITY_MS - 1),
          },
        ],
        NOW,
      ),
    ).toEqual([row("chase", "api:simplefin", -5905)]);
  });

  it("retains the reported $240.30 browser set independently of headline precedence", () => {
    const browserRows = [
      row("capone", "scrape:capitalone", -1271),
      row("capone", "scrape:capitalone", -1948),
      row("capone", "scrape:capitalone", -20811),
    ];

    const selected = selectWorkingPending(
      [...browserRows, row("capone", "api:simplefin", -1271)],
      [{ id: "capone", browserPendingAsOf: new Date(NOW) }],
      NOW,
    );

    expect(selected).toEqual(browserRows);
    expect(selected.reduce((sum, pending) => sum + pending.amountCents, 0)).toBe(
      -24030,
    );
  });
});
