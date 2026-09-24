import { describe, expect, it } from "vitest";
import {
  capturedRanges,
  isCovered,
  planCoverage,
  rowsAFileMayAuthor,
  statementStart,
} from "./captureCoverage";

const row = (day: string) => ({ transactionDate: day, postedDate: day });

describe("statementStart", () => {
  it("starts the day after the previous month's close", () => {
    expect(statementStart("2026-09-14", null)).toBe("2026-08-15");
  });

  it("clamps a close day the previous month lacks", () => {
    expect(statementStart("2026-03-31", null)).toBe("2026-03-01");
  });

  it("prefers a stored statement's own start", () => {
    expect(statementStart("2026-09-14", "2026-08-16")).toBe("2026-08-16");
  });
});

describe("capturedRanges", () => {
  const capturedAt = new Date(2026, 8, 23, 12); // Sep 23 local noon

  it("covers the closed statement and the cycle after it", () => {
    expect(
      capturedRanges(
        {
          capturedAt,
          posted: [row("2026-09-20")],
          recentStatementClosedOn: "2026-09-14",
        },
        null,
      ),
    ).toEqual([
      { fromDay: "2026-08-15", throughDay: "2026-09-14" },
      { fromDay: "2026-09-15", throughDay: "2026-09-22" },
    ]);
  });

  it("starts the current cycle at the earliest posted row when no statement was sent", () => {
    expect(
      capturedRanges(
        {
          capturedAt,
          posted: [row("2026-09-20"), row("2026-09-16")],
          recentStatementClosedOn: null,
        },
        null,
      ),
    ).toEqual([{ fromDay: "2026-09-16", throughDay: "2026-09-22" }]);
  });

  it("leaves the capture day open, since more can post to it after the paste", () => {
    const morning = new Date(2026, 8, 23, 8);
    const ranges = capturedRanges(
      {
        capturedAt: morning,
        posted: [row("2026-09-23")],
        recentStatementClosedOn: null,
      },
      null,
    );
    expect(isCovered("2026-09-23", ranges)).toBe(false);
  });

  it("covers a closed statement whole even when it closed yesterday", () => {
    expect(
      capturedRanges(
        { capturedAt, posted: [], recentStatementClosedOn: "2026-09-22" },
        null,
      ),
    ).toEqual([{ fromDay: "2026-08-23", throughDay: "2026-09-22" }]);
  });
});

describe("planCoverage", () => {
  const stored = [{ id: "a", fromDay: "2026-09-15", throughDay: "2026-09-18" }];

  it("extends a cycle instead of adding beside it", () => {
    expect(
      planCoverage(stored, [{ fromDay: "2026-09-15", throughDay: "2026-09-23" }]),
    ).toEqual({
      insert: [{ fromDay: "2026-09-15", throughDay: "2026-09-23" }],
      removeIds: ["a"],
    });
  });

  it("does nothing for a range already covered", () => {
    expect(
      planCoverage(stored, [{ fromDay: "2026-09-16", throughDay: "2026-09-17" }]),
    ).toEqual({
      insert: [],
      removeIds: [],
    });
  });
});

describe("isCovered", () => {
  it("is inclusive at both ends and false outside", () => {
    const ranges = [{ fromDay: "2026-09-15", throughDay: "2026-09-23" }];
    expect(isCovered("2026-09-15", ranges)).toBe(true);
    expect(isCovered("2026-09-23", ranges)).toBe(true);
    expect(isCovered("2026-09-14", ranges)).toBe(false);
  });
});

describe("rowsAFileMayAuthor", () => {
  const pasted = [{ fromDay: "2026-08-15", throughDay: "2026-09-14" }];
  const page = { historySource: "bank_page", historySourceSince: "2026-07-31" };

  it("takes only the days no paste read and that fall after the cutover", () => {
    const rows = [
      row("2026-07-20"),
      row("2026-08-05"),
      row("2026-08-20"),
      row("2026-09-16"),
    ];
    expect(rowsAFileMayAuthor(rows, page, pasted)).toEqual({
      keep: [row("2026-08-05"), row("2026-09-16")],
      withheld: 2,
    });
  });

  it("judges a row by the day it posted, which is what a paste's range is measured in", () => {
    const madeBeforePostedInside = {
      transactionDate: "2026-08-13",
      postedDate: "2026-08-15",
    };
    expect(rowsAFileMayAuthor([madeBeforePostedInside], page, pasted).withheld).toBe(1);
  });

  it("leaves an account the feed or files author untouched", () => {
    const rows = [row("2026-08-20")];
    expect(
      rowsAFileMayAuthor(
        rows,
        { historySource: "simplefin", historySourceSince: null },
        pasted,
      ),
    ).toEqual({ keep: rows, withheld: 0 });
  });
});
