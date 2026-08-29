import { describe, expect, it } from "vitest";
import {
  coveredByFeed,
  feedWatermarkOf,
  isHistoryFeed,
  ownershipDateKey,
  splitByWatermark,
} from "./feedWatermark";

function row(
  externalSource: string | null,
  transactionDate: string,
  over: { postedDate?: string | null; pending?: boolean } = {},
) {
  return {
    externalSource,
    transactionDate,
    postedDate: over.postedDate ?? null,
    pending: over.pending ?? false,
  };
}

describe("ownershipDateKey", () => {
  it("prefers the posted day, which is the axis both feeds agree on", () => {
    expect(
      ownershipDateKey({ transactionDate: "2026-08-22", postedDate: "2026-08-24" }),
    ).toBe("2026-08-24");
    expect(ownershipDateKey({ transactionDate: "2026-08-22", postedDate: null })).toBe(
      "2026-08-22",
    );
  });
});

describe("isHistoryFeed", () => {
  it("counts SimpleFIN and every file download, never a browser capture", () => {
    expect(isHistoryFeed("api:simplefin")).toBe(true);
    expect(isHistoryFeed("csv:chase-credit")).toBe(true);
    expect(isHistoryFeed("scrape:chase")).toBe(false);
    expect(isHistoryFeed("scrape:capitalone")).toBe(false);
    expect(isHistoryFeed(null)).toBe(false);
    expect(isHistoryFeed("")).toBe(false);
  });
});

describe("feedWatermarkOf", () => {
  it("is the latest posted day a non-browser feed holds", () => {
    expect(
      feedWatermarkOf([
        row("api:simplefin", "2026-08-12", { postedDate: "2026-08-14" }),
        row("csv:chase-credit", "2026-08-10", { postedDate: "2026-08-10" }),
      ]),
    ).toBe("2026-08-14");
  });

  it("ignores browser rows, which is what makes the tail the browser's", () => {
    expect(
      feedWatermarkOf([
        row("api:simplefin", "2026-08-14", { postedDate: "2026-08-14" }),
        row("scrape:chase", "2026-08-28", { postedDate: "2026-08-28" }),
      ]),
    ).toBe("2026-08-14");
  });

  it("ignores a feed hold, which is not a delivered day", () => {
    // A SimpleFIN pending row on the 27th must not suppress the browser's posted rows for
    // the 27th: the feed has authorised that charge, not settled it.
    expect(
      feedWatermarkOf([
        row("api:simplefin", "2026-08-14", { postedDate: "2026-08-14" }),
        row("api:simplefin", "2026-08-27", { pending: true }),
      ]),
    ).toBe("2026-08-14");
  });

  it("is null when only the browser has ever written to the account", () => {
    expect(feedWatermarkOf([row("scrape:capitalone", "2026-08-28")])).toBeNull();
    expect(feedWatermarkOf([])).toBeNull();
  });
});

describe("splitByWatermark", () => {
  it("gives the watermark day itself to the feed", () => {
    const { owned, covered } = splitByWatermark(
      [
        { transactionDate: "2026-08-22", postedDate: "2026-08-24" },
        { transactionDate: "2026-08-25", postedDate: "2026-08-25" },
      ],
      "2026-08-24",
    );
    expect(covered).toHaveLength(1);
    expect(owned).toEqual([
      { transactionDate: "2026-08-25", postedDate: "2026-08-25" },
    ]);
  });

  it("gives everything to the browser when there is no watermark", () => {
    const { owned, covered } = splitByWatermark(
      [{ transactionDate: "2020-01-01", postedDate: null }],
      null,
    );
    expect(owned).toHaveLength(1);
    expect(covered).toEqual([]);
  });
});

describe("coveredByFeed", () => {
  it("compares calendar days, never instants", () => {
    // Both sides are `YYYY-MM-DD`, so this is a string comparison and the process timezone
    // cannot move the boundary that decides which feed owns a row.
    expect(
      coveredByFeed({ transactionDate: "2026-08-24", postedDate: null }, "2026-08-24"),
    ).toBe(true);
    expect(
      coveredByFeed({ transactionDate: "2026-08-25", postedDate: null }, "2026-08-24"),
    ).toBe(false);
  });
});
