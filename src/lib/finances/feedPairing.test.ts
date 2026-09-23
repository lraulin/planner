import { describe, expect, it } from "vitest";
import {
  LOST_HOLD_TOLERANCE_DAYS,
  pairRows,
  resolveLostHold,
  type PairableRow,
} from "./feedPairing";

function row(over: Partial<PairableRow> = {}): PairableRow {
  return {
    id: "row",
    transactionDate: "2026-09-07",
    postedDate: "2026-09-07",
    amountCents: -2120,
    description: "ChatGPT",
    ...over,
  };
}

describe("pairRows", () => {
  it("does not pair ChatGPT with Claude just because the date and amount are close", () => {
    // Production case: scraped ChatGPT (Sep 7) with only SimpleFIN's Claude (Sep 9) on
    // file. Same amount, two days apart — within DATE_TOLERANCE_DAYS — but the names do
    // not overlap, and pairing them is exactly the bug this module exists to prevent.
    const pairings = pairRows(
      [row({ id: "browser-chatgpt", description: "ChatGPT" })],
      [
        row({
          id: "feed-claude",
          transactionDate: "2026-09-09",
          postedDate: "2026-09-09",
          description: "Claude",
        }),
      ],
    );
    expect(pairings).toEqual([]);
  });

  it("pairs ChatGPT with its own row instead of Claude's once it arrives", () => {
    const pairings = pairRows(
      [row({ id: "browser-chatgpt", description: "ChatGPT" })],
      [
        row({
          id: "feed-claude",
          transactionDate: "2026-09-09",
          postedDate: "2026-09-09",
          description: "Claude",
        }),
        row({ id: "feed-chatgpt", description: "ChatGPT" }),
      ],
    );
    expect(pairings).toEqual([
      { browserId: "browser-chatgpt", feedId: "feed-chatgpt" },
    ]);
  });

  it("pairs two identical same-day charges one-to-one, not both onto one feed row", () => {
    const pairings = pairRows(
      [row({ id: "browser-1" }), row({ id: "browser-2" })],
      [row({ id: "feed-1" }), row({ id: "feed-2" })],
    );
    expect(pairings).toHaveLength(2);
    const feedIds = pairings.map((p) => p.feedId).sort();
    const browserIds = pairings.map((p) => p.browserId).sort();
    expect(feedIds).toEqual(["feed-1", "feed-2"]);
    expect(browserIds).toEqual(["browser-1", "browser-2"]);
  });

  it("only pairs the rows a partial delivery actually covers (Sep 10 replay)", () => {
    // Scrape holds distinct charges dated Sep 1 and Sep 7; the feed has only delivered
    // Sep 8-9's own, unrelated charges. Being a day or two apart is not enough — these are
    // different amounts and merchants, so nothing should pair yet.
    const scrapeSep1 = row({
      id: "sep-1",
      transactionDate: "2026-09-01",
      postedDate: "2026-09-01",
      amountCents: -101,
      description: "Merchant A",
    });
    const scrapeSep7 = row({
      id: "sep-7",
      transactionDate: "2026-09-07",
      postedDate: "2026-09-07",
      amountCents: -707,
      description: "Merchant G",
    });
    const scrapeRows = [scrapeSep1, scrapeSep7];

    const feedSep8 = row({
      id: "feed-sep-8",
      transactionDate: "2026-09-08",
      postedDate: "2026-09-08",
      amountCents: -808,
      description: "Merchant H",
    });
    const feedSep9 = row({
      id: "feed-sep-9",
      transactionDate: "2026-09-09",
      postedDate: "2026-09-09",
      amountCents: -909,
      description: "Merchant I",
    });
    expect(pairRows(scrapeRows, [feedSep8, feedSep9])).toEqual([]);

    // A day later the feed delivers Sep 7's own charge — same amount, same merchant — and
    // only that row pairs.
    const feedSep7 = row({
      id: "feed-sep-7",
      transactionDate: "2026-09-07",
      postedDate: "2026-09-07",
      amountCents: -707,
      description: "Merchant G",
    });
    expect(pairRows(scrapeRows, [feedSep8, feedSep9, feedSep7])).toEqual([
      { browserId: "sep-7", feedId: "feed-sep-7" },
    ]);
  });

  it("never pairs the same row twice", () => {
    const pairings = pairRows(
      [row({ id: "browser-1" })],
      [row({ id: "feed-1" }), row({ id: "feed-2" })],
    );
    expect(pairings).toHaveLength(1);
  });

  it("retires a card-payment hold whose pending page names it by source, not channel", () => {
    // Production case: this pair never retired. "Payment from CAPITAL ONE N.A. ...2322"
    // and "CAPITAL ONE ONLINE PYMT" share no opening words, so the browser row survived
    // as a permanent duplicate leg counted in the unmatched-transfer total.
    const pairings = pairRows(
      [
        row({
          id: "browser-payment",
          amountCents: 172195,
          description: "Payment from CAPITAL ONE N.A. ...2322",
        }),
      ],
      [
        row({
          id: "feed-payment",
          amountCents: 172195,
          description: "CAPITAL ONE ONLINE PYMT",
        }),
      ],
    );
    expect(pairings).toEqual([
      { browserId: "browser-payment", feedId: "feed-payment" },
    ]);
  });
});

describe("resolveLostHold", () => {
  const hold = row({ id: "hold", amountCents: -2000, description: "Domino's" });

  it("carries the hold's state to the one posted row within the tip band", () => {
    const posted = row({
      id: "posted",
      amountCents: -2100,
      description: "DOMINOS 1234",
    });
    expect(resolveLostHold(hold, [posted])).toEqual({
      outcome: "carry",
      postedId: "posted",
    });
  });

  it("finds nothing when no posted row is close enough in amount", () => {
    const posted = row({
      id: "posted",
      amountCents: -5000,
      description: "DOMINOS 1234",
    });
    expect(resolveLostHold(hold, [posted])).toEqual({ outcome: "none" });
  });

  it("finds nothing when the posted row is dated past the tolerance", () => {
    const posted = row({
      id: "posted",
      amountCents: -2100,
      description: "DOMINOS 1234",
      transactionDate: "2026-09-20",
      postedDate: "2026-09-20",
    });
    expect(resolveLostHold(hold, [posted])).toEqual({ outcome: "none" });
  });

  it("carries to the one qualifying row even when its description does not overlap", () => {
    // D4: a page's own display name for a hold routinely shares nothing with a feed's
    // fuller descriptor (Amazon.com vs AMAZON MKTPL*537NK9DZ2). Description ranks
    // candidates; it never gates the single one that qualifies on amount and date.
    const posted = row({ id: "posted", amountCents: -2100, description: "Pizza Hut" });
    expect(resolveLostHold(hold, [posted])).toEqual({
      outcome: "carry",
      postedId: "posted",
    });
  });

  it("refuses to guess between several equally plausible successors", () => {
    const first = row({
      id: "posted-1",
      amountCents: -2100,
      description: "DOMINOS 1234",
    });
    const second = row({
      id: "posted-2",
      amountCents: -2050,
      description: "DOMINOS 5678",
    });
    expect(resolveLostHold(hold, [first, second])).toEqual({
      outcome: "ambiguous",
      candidateIds: ["posted-1", "posted-2"],
    });
  });

  it("picks the one clear description winner among several qualifying rows", () => {
    const winner = row({
      id: "posted-winner",
      amountCents: -2100,
      description: "DOMINOS 1234",
    });
    const stranger = row({
      id: "posted-stranger",
      amountCents: -2050,
      description: "Pizza Hut",
    });
    expect(resolveLostHold(hold, [winner, stranger])).toEqual({
      outcome: "carry",
      postedId: "posted-winner",
    });
  });

  it("retires a hold that posted with a 20% tip onto the same merchant's row", () => {
    // Production case, 2026-09-21: Capital One held Kim's Nails III at $50 on Sep 19 and
    // posted $60 on Sep 21. The $10 tip is outside Actual's 7.5% band, so the hold was kept
    // and flagged beside its own posting — the same money twice in the register.
    const nails = row({
      id: "hold",
      transactionDate: "2026-09-19",
      postedDate: null,
      amountCents: -5000,
      description: "Kim's Nails III",
    });
    const posted = row({
      id: "posted",
      transactionDate: "2026-09-21",
      postedDate: "2026-09-21",
      amountCents: -6000,
      description: "KIMS NAILS III",
    });
    expect(resolveLostHold(nails, [posted])).toEqual({
      outcome: "carry",
      postedId: "posted",
    });
  });

  it("does not take a larger charge from a different merchant as a tip", () => {
    const posted = row({ id: "posted", amountCents: -2600, description: "Pizza Hut" });
    expect(resolveLostHold(hold, [posted])).toEqual({ outcome: "none" });
  });

  it("does not take a smaller charge, or one past the tip ceiling, as a tip", () => {
    const smaller = row({
      id: "smaller",
      amountCents: -1500,
      description: "DOMINOS 1",
    });
    const doubled = row({
      id: "doubled",
      amountCents: -3100,
      description: "DOMINOS 2",
    });
    expect(resolveLostHold(hold, [smaller])).toEqual({ outcome: "none" });
    expect(resolveLostHold(hold, [doubled])).toEqual({ outcome: "none" });
  });

  it("accepts a posted row right at the tolerance boundary", () => {
    const posted = row({
      id: "posted",
      amountCents: -2100,
      description: "DOMINOS 1234",
      transactionDate: `2026-09-${String(7 + LOST_HOLD_TOLERANCE_DAYS).padStart(2, "0")}`,
      postedDate: `2026-09-${String(7 + LOST_HOLD_TOLERANCE_DAYS).padStart(2, "0")}`,
    });
    expect(resolveLostHold(hold, [posted])).toEqual({
      outcome: "carry",
      postedId: "posted",
    });
  });
});
