import { describe, expect, it } from "vitest";
import type { SourceStamp } from "./sourceAuthority";
import {
  selectWorkingPending,
  withheldBrowserPendingAccountIds,
} from "./workingPending";

const at = (iso: string): SourceStamp => ({ asOf: new Date(iso), asOfDay: null });

/** The feed's stamp on a card synced this morning; captures below are compared against it. */
const FEED = at("2026-08-18T09:00:00Z");

function row(
  accountId: string,
  source: string,
  amountCents: number,
): { accountId: string; source: string; amountCents: number } {
  return { accountId, source, amountCents };
}

describe("selectWorkingPending", () => {
  it("keeps SimpleFIN pending when no capture has landed", () => {
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905)],
        [{ id: "chase", browserAsOf: null, feedAsOf: FEED }],
      ),
    ).toEqual([row("chase", "api:simplefin", -5905)]);
  });

  it("uses only browser pending on the account whose capture is the more current", () => {
    const selected = selectWorkingPending(
      [
        row("chase", "api:simplefin", -5905),
        row("chase", "scrape:chase", -2284),
        row("capone", "scrape:capitalone", -1691),
      ],
      [
        { id: "chase", browserAsOf: at("2026-08-18T16:00:00Z"), feedAsOf: FEED },
        { id: "capone", browserAsOf: null, feedAsOf: FEED },
      ],
    );
    expect(selected).toEqual([row("chase", "scrape:chase", -2284)]);
  });

  it("treats an empty capture as no pending while it is the more current", () => {
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905)],
        [{ id: "chase", browserAsOf: at("2026-08-18T16:00:00Z"), feedAsOf: FEED }],
      ),
    ).toEqual([]);
  });

  it("keeps a two-day-old capture authoritative while the feed is further behind", () => {
    // The regression: under the flat 36-hour window this capture had expired and its rows
    // silently stopped counting, even though nothing fresher had arrived to replace them.
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905), row("chase", "scrape:chase", -2284)],
        [
          {
            id: "chase",
            browserAsOf: at("2026-08-16T16:00:00Z"),
            feedAsOf: at("2026-08-14T09:00:00Z"),
          },
        ],
      ),
    ).toEqual([row("chase", "scrape:chase", -2284)]);
  });

  it("hands pending back the moment the feed reports later", () => {
    // And the other direction: an hour after the capture, not 36 hours after.
    expect(
      selectWorkingPending(
        [row("chase", "api:simplefin", -5905), row("chase", "scrape:chase", -2284)],
        [
          {
            id: "chase",
            browserAsOf: at("2026-08-18T08:00:00Z"),
            feedAsOf: at("2026-08-18T09:00:00Z"),
          },
        ],
      ),
    ).toEqual([row("chase", "api:simplefin", -5905)]);
  });

  it("gives an unsynced account's pending to the capture", () => {
    expect(
      selectWorkingPending(
        [row("capone", "scrape:capitalone", -1691)],
        [{ id: "capone", browserAsOf: at("2026-08-18T16:00:00Z"), feedAsOf: null }],
      ),
    ).toEqual([row("capone", "scrape:capitalone", -1691)]);
  });

  it("retains the reported $240.30 browser set independently of headline precedence", () => {
    const browserRows = [
      row("capone", "scrape:capitalone", -1271),
      row("capone", "scrape:capitalone", -1948),
      row("capone", "scrape:capitalone", -20811),
    ];

    const selected = selectWorkingPending(
      [...browserRows, row("capone", "api:simplefin", -1271)],
      [{ id: "capone", browserAsOf: at("2026-08-18T16:00:00Z"), feedAsOf: FEED }],
    );

    expect(selected).toEqual(browserRows);
    expect(selected.reduce((sum, pending) => sum + pending.amountCents, 0)).toBe(
      -24030,
    );
  });
});

describe("withheldBrowserPendingAccountIds", () => {
  /** A capture the feed has since overtaken. */
  const superseded = { browserAsOf: at("2026-08-18T08:00:00Z"), feedAsOf: FEED };

  it("reports a superseded capture whose rows are excluded from the money", () => {
    expect(
      withheldBrowserPendingAccountIds(
        [row("chase", "api:simplefin", -5905), row("chase", "scrape:chase", -2284)],
        [{ id: "chase", ...superseded }],
      ),
    ).toEqual(["chase"]);
  });

  it("stays silent when a superseded capture holds nothing back", () => {
    // The reported case: the card has no pending activity at all, so SimpleFIN already
    // reports everything a fresh capture could and the ask has no effect.
    expect(
      withheldBrowserPendingAccountIds([], [{ id: "chase", ...superseded }]),
    ).toEqual([]);
    expect(
      withheldBrowserPendingAccountIds(
        [row("chase", "api:simplefin", -5905)],
        [{ id: "chase", ...superseded }],
      ),
    ).toEqual([]);
  });

  it("stays silent while the capture is still the more current", () => {
    expect(
      withheldBrowserPendingAccountIds(
        [row("chase", "scrape:chase", -2284)],
        [{ id: "chase", browserAsOf: at("2026-08-18T16:00:00Z"), feedAsOf: FEED }],
      ),
    ).toEqual([]);
  });

  it("names each superseded card once and leaves never-captured cards alone", () => {
    expect(
      withheldBrowserPendingAccountIds(
        [
          row("capone", "scrape:capitalone", -1271),
          row("capone", "scrape:capitalone", -1948),
          row("chase", "api:simplefin", -5905),
        ],
        [
          { id: "capone", ...superseded },
          { id: "chase", browserAsOf: null, feedAsOf: FEED },
        ],
      ),
    ).toEqual(["capone"]);
  });
});
