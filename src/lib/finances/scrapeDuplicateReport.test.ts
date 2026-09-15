import { describe, expect, it } from "vitest";
import {
  findScrapeDuplicates,
  formatScrapeDuplicateReport,
  type DuplicateCandidateRow,
} from "./scrapeDuplicateReport";

function row(over: Partial<DuplicateCandidateRow> = {}): DuplicateCandidateRow {
  return {
    id: "row",
    accountId: "account-1",
    transactionDate: "2026-09-13",
    postedDate: "2026-09-13",
    amountCents: -19556,
    description: "WALMART",
    externalSource: "scrape:chase",
    ...over,
  };
}

describe("findScrapeDuplicates", () => {
  it("pairs a scrape row with a feed row at the same amount and date despite different names", () => {
    // Production case: Chase page display name vs. SimpleFIN's fuller descriptor share no
    // substring, so a description-gated matcher (feedPairing.ts's pairRows) would miss it.
    const matches = findScrapeDuplicates([
      row({
        id: "scrape-1",
        description: "Amazon.com",
        externalSource: "scrape:chase",
      }),
      row({
        id: "feed-1",
        description: "AMAZON MKTPL*537NK9DZ2",
        externalSource: "api:simplefin",
      }),
    ]);
    expect(matches).toEqual([
      expect.objectContaining({
        scrapeId: "scrape-1",
        feedId: "feed-1",
        amountCents: -19556,
      }),
    ]);
  });

  it("does not pair rows on different accounts", () => {
    const matches = findScrapeDuplicates([
      row({ id: "scrape-1", accountId: "account-1", externalSource: "scrape:chase" }),
      row({ id: "feed-1", accountId: "account-2", externalSource: "api:simplefin" }),
    ]);
    expect(matches).toEqual([]);
  });

  it("does not pair rows whose amounts disagree", () => {
    const matches = findScrapeDuplicates([
      row({ id: "scrape-1", amountCents: -1000, externalSource: "scrape:chase" }),
      row({ id: "feed-1", amountCents: -1077, externalSource: "api:simplefin" }),
    ]);
    expect(matches).toEqual([]);
  });

  it("does not pair rows more than DATE_TOLERANCE_DAYS apart", () => {
    const matches = findScrapeDuplicates([
      row({
        id: "scrape-1",
        transactionDate: "2026-09-01",
        externalSource: "scrape:chase",
      }),
      row({
        id: "feed-1",
        transactionDate: "2026-09-10",
        postedDate: "2026-09-10",
        externalSource: "api:simplefin",
      }),
    ]);
    expect(matches).toEqual([]);
  });

  it("never pairs two scrape rows, or two feed rows, with each other", () => {
    const matches = findScrapeDuplicates([
      row({ id: "scrape-1", externalSource: "scrape:chase" }),
      row({ id: "scrape-2", externalSource: "scrape:chase" }),
    ]);
    expect(matches).toEqual([]);
  });

  it("is occurrence-counted: a feed row absorbs only its nearest scrape twin", () => {
    const matches = findScrapeDuplicates([
      row({
        id: "scrape-near",
        transactionDate: "2026-09-13",
        externalSource: "scrape:chase",
      }),
      row({
        id: "scrape-far",
        transactionDate: "2026-09-12",
        postedDate: "2026-09-12",
        externalSource: "scrape:chase",
      }),
      row({
        id: "feed-1",
        transactionDate: "2026-09-13",
        externalSource: "api:simplefin",
      }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].scrapeId).toBe("scrape-near");
  });

  it("leaves a scrape row alone when nothing on the feed matches it", () => {
    const matches = findScrapeDuplicates([
      row({ id: "scrape-1", externalSource: "scrape:chase" }),
    ]);
    expect(matches).toEqual([]);
  });
});

describe("formatScrapeDuplicateReport", () => {
  it("says none found when the list is empty", () => {
    expect(formatScrapeDuplicateReport([])).toContain("none — no scrape:*");
  });

  it("prints both descriptions and both ids for a match", () => {
    const output = formatScrapeDuplicateReport([
      {
        accountId: "account-1",
        accountName: "Chase Freedom",
        scrapeId: "scrape-1",
        scrapeDescription: "Amazon.com",
        scrapeSource: "scrape:chase",
        feedId: "feed-1",
        feedDescription: "AMAZON MKTPL*537NK9DZ2",
        amountCents: -1377,
        transactionDate: "2026-09-13",
      },
    ]);
    expect(output).toContain("Amazon.com");
    expect(output).toContain("AMAZON MKTPL*537NK9DZ2");
    expect(output).toContain("scrape-1");
    expect(output).toContain("feed-1");
    expect(output).toContain("-$13.77");
    expect(output).toContain("Chase Freedom");
  });
});
