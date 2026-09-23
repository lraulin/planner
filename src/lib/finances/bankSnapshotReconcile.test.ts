import { describe, expect, it } from "vitest";
import type { ParsedBankSnapshotRow } from "./bankSnapshot";
import {
  awaitingFeedPhrase,
  planBankSnapshotReconciliation,
  type ExistingBankSnapshotRow,
} from "./bankSnapshotReconcile";

function incoming(
  description: string,
  amountCents: number,
  date = "2026-08-27",
): ParsedBankSnapshotRow {
  return {
    transactionDate: date,
    postedDate: date,
    description,
    sourceCategory: "",
    amountCents,
    externalId: `${date}|${description}|${amountCents}`,
    raw: {
      transactionDate: date,
      postedDate: date,
      description,
      category: "",
      amount: String(-amountCents / 100),
    },
  };
}

function existing(
  id: string,
  description: string,
  amountCents: number,
  over: Partial<ExistingBankSnapshotRow> = {},
): ExistingBankSnapshotRow {
  return {
    id,
    transactionDate: "2026-08-27",
    postedDate: null,
    description,
    amountCents,
    pending: true,
    externalSource: "scrape:chase",
    externalId: id,
    isParent: false,
    postedAtBank: null,
    unlistedAt: null,
    budgetCategoryId: null,
    notes: "",
    flowOverride: null,
    ...over,
  };
}

describe("planBankSnapshotReconciliation", () => {
  it("leaves a posted row a stored feed row already pairs with to the feed", () => {
    // The 2026-08-29 Capital One snapshot. The page says `Pizza Hut` and dates the charge
    // by the purchase day; the stored row carries the bank descriptor `PIZZA HUT 036874`
    // and the posted day. Neither the description nor the transaction date lines up
    // exactly, but the brand-stem rule and the date tolerance both reach across it.
    const plan = planBankSnapshotReconciliation(
      [
        existing("stored", "PIZZA HUT 036874", -3252, {
          pending: false,
          transactionDate: "2026-08-24",
          postedDate: "2026-08-24",
          externalSource: "api:simplefin",
        }),
      ],
      [
        {
          ...incoming("Pizza Hut", -3252, "2026-08-22"),
          postedDate: "2026-08-24",
        },
      ],
      [],
      false,
    );
    expect(plan.postedCoveredByFeed).toBe(1);
    expect(plan.postedInserts).toEqual([]);
    expect(plan.postedDuplicates).toEqual([]);
  });

  it("inserts a posted row no feed row pairs with", () => {
    // `CVS $22.84` on 2026-08-18 pairs with nothing on file, so it is a real new charge —
    // regardless of what any feed's own dates might otherwise suggest it should own.
    const plan = planBankSnapshotReconciliation(
      [],
      [incoming("CVS", -2284, "2026-08-18")],
      [],
      false,
    );
    expect(plan.postedInserts).toHaveLength(1);
    expect(plan.postedCoveredByFeed).toBe(0);
  });

  it("owns everything when no feed has ever delivered this account", () => {
    const plan = planBankSnapshotReconciliation(
      [],
      [incoming("CVS", -2284, "2020-01-01")],
      [],
      false,
    );
    expect(plan.postedInserts).toHaveLength(1);
  });

  it("recognises its own earlier paste of the same page and inserts nothing", () => {
    // A second identical paste is a no-op. The userscript derives `externalId` from the
    // page row, so this is an identity rather than a description comparison — and the
    // brand-stem matcher that once did this job could not tell `CAPITAL ONE MOBILE PYMT`
    // from `Payment from CAPITAL ONE N.A. ...2322`.
    const first = incoming("AMAZON MKTPL", -1999);
    const second = incoming("AMAZON MKTPL", -1999);
    const plan = planBankSnapshotReconciliation(
      [
        existing("a", "Amazon.com", -1999, {
          pending: false,
          externalId: first.externalId,
        }),
      ],
      [first, second],
      [],
      false,
    );
    expect(plan.postedDuplicates.map((row) => row.existingId)).toEqual(["a"]);
    // The two incoming rows carry the same stem, so only one can be the stored one; the
    // second is a genuine second charge of the same amount on the same day.
    expect(plan.postedInserts).toHaveLength(1);
  });

  it("converts an exact pending row in place", () => {
    const plan = planBankSnapshotReconciliation(
      [existing("pending", "CVS PHARMACY", -2284)],
      [incoming("CVS PHARMACY", -2284, "2026-08-28")],
      [],
      false,
    );
    expect(plan.postedTransitions).toEqual([
      expect.objectContaining({ existingId: "pending", amountChanged: false }),
    ]);
  });

  it("preserves an unambiguous unsplit pending row when the amount changes", () => {
    const plan = planBankSnapshotReconciliation(
      [existing("gas", "SHEETZ 123", -10000)],
      [incoming("SHEETZ 123", -6789, "2026-08-28")],
      [],
      false,
    );
    expect(plan.postedTransitions).toEqual([
      expect.objectContaining({ existingId: "gas", amountChanged: true }),
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("treats matching browser and SimpleFIN holds as one changed occurrence", () => {
    const plan = planBankSnapshotReconciliation(
      [
        existing("browser-gas", "SHEETZ 123", -10000),
        existing("simplefin-gas", "SHEETZ 123", -10000, {
          externalSource: "api:simplefin",
        }),
      ],
      [incoming("SHEETZ 123", -6789, "2026-08-28")],
      [],
      false,
    );
    expect(plan.postedTransitions).toEqual([
      expect.objectContaining({ existingId: "browser-gas", amountChanged: true }),
    ]);
    expect(plan.pendingDeletes).toEqual(["simplefin-gas"]);
    expect(plan.postedInserts).toEqual([]);
  });

  it("replaces and warns when a split pending amount changes", () => {
    const plan = planBankSnapshotReconciliation(
      [existing("restaurant", "DINER", -5000, { isParent: true })],
      [incoming("DINER", -6200)],
      [],
      false,
    );
    expect(plan.postedReplacements[0]?.existingId).toBe("restaurant");
    expect(plan.warnings[0]).toContain("split edits were discarded");
  });

  it("does not guess between ambiguous amount-changed pending rows", () => {
    const plan = planBankSnapshotReconciliation(
      [
        existing("one", "RESTAURANT", -5000, { isParent: true }),
        existing("two", "RESTAURANT", -5100),
      ],
      [incoming("RESTAURANT", -6200)],
      [],
      false,
    );
    expect(plan.postedInserts).toHaveLength(1);
    expect(plan.postedTransitions).toEqual([]);
    expect(plan.warnings[0]).toContain("Could not attach");
  });

  it("retires the pending hold for a posted row it already has", () => {
    const posted = incoming("CVS PHARMACY", -2284, "2026-08-28");
    const plan = planBankSnapshotReconciliation(
      [
        existing("stored", "CVS PHARMACY", -2284, {
          pending: false,
          externalId: posted.externalId,
        }),
        existing("hold", "CVS PHARMACY", -2284),
      ],
      [posted],
      [],
      false,
    );
    expect(plan.postedDuplicates.map((row) => row.existingId)).toEqual(["stored"]);
    expect(plan.pendingDeletes).toEqual(["hold"]);
  });

  it("converts the nearest of two matching holds, not the first by id", () => {
    const plan = planBankSnapshotReconciliation(
      [
        existing("a-far", "CVS PHARMACY", -2284, { transactionDate: "2026-08-26" }),
        existing("z-near", "CVS PHARMACY", -2284, { transactionDate: "2026-08-28" }),
      ],
      [incoming("CVS PHARMACY", -2284, "2026-08-28")],
      [],
      false,
    );
    expect(plan.postedTransitions.map((row) => row.existingId)).toEqual(["z-near"]);
  });

  it("converts the browser hold and retires the SimpleFIN twin when both match exactly", () => {
    const plan = planBankSnapshotReconciliation(
      [
        existing("simplefin-cvs", "CVS PHARMACY", -2284, {
          externalSource: "api:simplefin",
        }),
        existing("browser-cvs", "CVS PHARMACY", -2284),
      ],
      [incoming("CVS PHARMACY", -2284, "2026-08-28")],
      [],
      false,
    );
    expect(plan.postedTransitions.map((row) => row.existingId)).toEqual([
      "browser-cvs",
    ]);
    expect(plan.pendingDeletes).toEqual(["simplefin-cvs"]);
  });

  it("keeps a split hold's edits when its posted twin is the only candidate", () => {
    const plan = planBankSnapshotReconciliation(
      [existing("restaurant", "DINER", -5000, { isParent: true })],
      [incoming("DINER", -5000)],
      [],
      false,
    );
    expect(plan.postedTransitions.map((row) => row.existingId)).toEqual(["restaurant"]);
    expect(plan.postedReplacements).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it("does not merge a browser and a SimpleFIN hold that disagree on the amount", () => {
    // Two holds, two different amounts: two occurrences, so the changed posted amount
    // cannot be pinned to either.
    const plan = planBankSnapshotReconciliation(
      [
        existing("browser-gas", "SHEETZ 123", -10000),
        existing("simplefin-gas", "SHEETZ 123", -9000, {
          externalSource: "api:simplefin",
        }),
      ],
      [incoming("SHEETZ 123", -6789, "2026-08-28")],
      [],
      false,
    );
    expect(plan.postedTransitions).toEqual([]);
    expect(plan.postedInserts).toHaveLength(1);
  });

  it("only ever considers browser pending for removal, leaving SimpleFIN stored for expiry fallback", () => {
    const plan = planBankSnapshotReconciliation(
      [
        existing("old-browser", "OLD", -100),
        existing("simplefin", "SIMPLEFIN ONLY", -200, {
          externalSource: "api:simplefin",
        }),
      ],
      [],
      [incoming("NEW", -300)],
      false,
    );
    // The old browser hold is unlisted with nothing to succeed it: flagged, not deleted.
    expect(plan.pendingDeletes).toEqual([]);
    expect(plan.unlistedMarks).toEqual(["old-browser"]);
    expect(plan.pendingInserts).toHaveLength(1);
  });

  it("carries a pending hold's envelope onto the feed row its own posting pairs with", () => {
    // The page proves CVS posted; SimpleFIN already has that exact charge stored. The
    // page copy is not inserted (it is already held by the feed), but the hold it replaces
    // still had a Category on it, and that has to land somewhere.
    const plan = planBankSnapshotReconciliation(
      [
        existing("feed-cvs", "CVS/PHARMACY #01522", -2284, {
          pending: false,
          externalSource: "api:simplefin",
        }),
        existing("hold-cvs", "CVS", -2284, {
          budgetCategoryId: "groceries",
          notes: "receipt in the drawer",
        }),
      ],
      [incoming("CVS", -2284, "2026-08-27")],
      [],
      false,
    );
    expect(plan.postedCoveredByFeed).toBe(1);
    expect(plan.postedInserts).toEqual([]);
    expect(plan.pendingDeletes).toEqual(["hold-cvs"]);
    expect(plan.pendingCarries).toEqual([
      {
        pendingId: "hold-cvs",
        targetId: "feed-cvs",
        carry: { budgetCategoryId: "groceries", notes: "receipt in the drawer" },
      },
    ]);
  });

  it("D3b: carries an omitted hold's state to the one posted row within the tip band", () => {
    const plan = planBankSnapshotReconciliation(
      [
        existing("posted-dominos", "DOMINOS 1234", -2100, {
          pending: false,
          externalSource: "api:simplefin",
        }),
        existing("hold-dominos", "Domino's", -2011, {
          budgetCategoryId: "dining",
        }),
      ],
      [],
      [],
      false,
    );
    expect(plan.pendingDeletes).toEqual(["hold-dominos"]);
    expect(plan.pendingCarries).toEqual([
      {
        pendingId: "hold-dominos",
        targetId: "posted-dominos",
        carry: { budgetCategoryId: "dining" },
      },
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("D3: keeps and flags a vanished hold when there is no successor, deleting nothing", () => {
    // 2026-09-20: a complete-looking capture no longer listed Chewy.com and the hold was
    // hard-deleted, returning $51.29 to Ready to Assign. Absence alone is not evidence.
    const plan = planBankSnapshotReconciliation(
      [existing("hold-chewy", "Chewy.com", -5129, { budgetCategoryId: "pets" })],
      [],
      [],
      true,
    );
    expect(plan.pendingDeletes).toEqual([]);
    expect(plan.pendingCarries).toEqual([]);
    expect(plan.unlistedMarks).toEqual(["hold-chewy"]);
    expect(plan.warnings[0]).toContain("Chewy.com");
    expect(plan.warnings[0]).toContain("flagged");
  });

  it("D3: an already-flagged hold stays flagged without warning again", () => {
    const plan = planBankSnapshotReconciliation(
      [existing("hold", "Chewy.com", -5129, { unlistedAt: new Date("2026-09-20") })],
      [],
      [],
      true,
    );
    expect(plan.unlistedMarks).toEqual(["hold"]);
    expect(plan.warnings).toEqual([]);
  });

  it("D3: a hold already marked posted at the bank is not also flagged unlisted", () => {
    const plan = planBankSnapshotReconciliation(
      [existing("hold", "Chewy.com", -5129, { postedAtBank: new Date("2026-09-20") })],
      [],
      [],
      true,
    );
    expect(plan.unlistedMarks).toEqual([]);
    expect(plan.pendingDeletes).toEqual([]);
  });

  describe("D2: the closed statement is successor evidence, never history", () => {
    const chewyRow = () => incoming("Chewy.com", -5129, "2026-09-19");

    it("Sep 20 replay: a hold that posted into the closed statement is marked, not lost", () => {
      const plan = planBankSnapshotReconciliation(
        [existing("hold-chewy", "Chewy.com", -5129, { transactionDate: "2026-09-18" })],
        [],
        [],
        true,
        [chewyRow()],
      );
      expect(plan.postedAtBankMarks).toEqual(["hold-chewy"]);
      expect(plan.pendingDeletes).toEqual([]);
      expect(plan.unlistedMarks).toEqual([]);
      // Evidence only: nothing about the statement row is written.
      expect(plan.postedInserts).toEqual([]);
    });

    it("does not let one statement row account for two holds", () => {
      const plan = planBankSnapshotReconciliation(
        [
          existing("hold-a", "Chewy.com", -5129, { transactionDate: "2026-09-18" }),
          existing("hold-b", "Chewy.com", -5129, { transactionDate: "2026-09-18" }),
        ],
        [],
        [],
        true,
        [chewyRow()],
      );
      expect(plan.postedAtBankMarks).toHaveLength(1);
      expect(plan.unlistedMarks).toHaveLength(1);
    });

    it("counts a charge once when a stored posted row already holds it", () => {
      // SimpleFIN delivered it and the statement lists it too: carrying onto the stored
      // row must win, not stall as an ambiguity between two rows for one charge.
      const plan = planBankSnapshotReconciliation(
        [
          existing("hold-chewy", "Chewy.com", -5129, {
            transactionDate: "2026-09-18",
            budgetCategoryId: "pets",
          }),
          existing("posted-chewy", "CHEWY.COM", -5129, {
            pending: false,
            transactionDate: "2026-09-19",
            postedDate: "2026-09-19",
            externalSource: "api:simplefin",
          }),
        ],
        [],
        [],
        true,
        [chewyRow()],
      );
      expect(plan.pendingCarries).toEqual([
        {
          pendingId: "hold-chewy",
          targetId: "posted-chewy",
          carry: { budgetCategoryId: "pets" },
        },
      ]);
      expect(plan.pendingDeletes).toEqual(["hold-chewy"]);
      expect(plan.warnings).toEqual([]);
    });
  });

  describe("D4: feed-covered accounts never write posted history", () => {
    it("Sep 14 replay: a posted row with no stored hold and no feed pair is not inserted", () => {
      // 12 Amazon charges Chase's page reports as newly posted, already held by SimpleFIN,
      // never seen pending on this page at all — nothing to mark, nothing to insert.
      const plan = planBankSnapshotReconciliation(
        [],
        [incoming("Amazon.com", -1377, "2026-09-13")],
        [],
        true,
      );
      expect(plan.postedInserts).toEqual([]);
      expect(plan.postedTransitions).toEqual([]);
      expect(plan.postedAtBankMarks).toEqual([]);
      expect(plan.warnings).toEqual([]);
    });

    it("names a posted row it left for the feed, and only that one", () => {
      // 2026-09-23 Capital One paste: nine posted rows, eight held by SimpleFIN, and
      // YouTube $16.95 (posted Sep 22) not delivered yet. The summary counted eight and said
      // nothing of the ninth, so it looked lost.
      const plan = planBankSnapshotReconciliation(
        [
          existing("feed-pizza", "PIZZA HUT 036874", -2500, {
            pending: false,
            postedDate: "2026-09-21",
            transactionDate: "2026-09-21",
            externalSource: "api:simplefin",
          }),
        ],
        [
          incoming("Pizza Hut", -2500, "2026-09-21"),
          incoming("YouTube", -1695, "2026-09-22"),
        ],
        [],
        true,
      );
      expect(plan.postedInserts).toEqual([]);
      expect(plan.postedAwaitingFeed.map((row) => row.description)).toEqual([
        "YouTube",
      ]);
      expect(awaitingFeedPhrase(plan.postedAwaitingFeed)).toBe(
        "1 posted not in the bank feed yet: YouTube $16.95",
      );
    });

    it("leaves nothing awaiting the feed on an account with no feed", () => {
      const plan = planBankSnapshotReconciliation(
        [],
        [incoming("YouTube", -1695, "2026-09-22")],
        [],
        false,
      );
      expect(plan.postedInserts.map((row) => row.description)).toEqual(["YouTube"]);
      expect(plan.postedAwaitingFeed).toEqual([]);
      expect(awaitingFeedPhrase(plan.postedAwaitingFeed)).toBe("");
    });

    it("marks a matching hold posted-at-bank instead of transitioning it", () => {
      const plan = planBankSnapshotReconciliation(
        [existing("hold", "CVS PHARMACY", -2284)],
        [incoming("CVS PHARMACY", -2284, "2026-08-28")],
        [],
        true,
      );
      expect(plan.postedAtBankMarks).toEqual(["hold"]);
      expect(plan.postedTransitions).toEqual([]);
      expect(plan.postedInserts).toEqual([]);
      expect(plan.pendingDeletes).toEqual([]);
    });

    it("marks the hold posted-at-bank instead of replacing it when the amount changed (a tip)", () => {
      const plan = planBankSnapshotReconciliation(
        [existing("gas", "SHEETZ 123", -10000)],
        [incoming("SHEETZ 123", -10500, "2026-08-28")],
        [],
        true,
      );
      expect(plan.postedAtBankMarks).toEqual(["gas"]);
      expect(plan.postedTransitions).toEqual([]);
      expect(plan.postedReplacements).toEqual([]);
      expect(plan.postedInserts).toEqual([]);
      expect(plan.warnings).toEqual([]);
    });

    it("discards an ambiguous amount-changed posted row instead of inserting it", () => {
      // Both holds are still listed pending, so D3a has nothing to resolve — this test is
      // only about the ambiguous-amount-change branch not inserting the posted row.
      const plan = planBankSnapshotReconciliation(
        [
          existing("one", "RESTAURANT", -5000, { isParent: true }),
          existing("two", "RESTAURANT", -5100),
        ],
        [incoming("RESTAURANT", -6200)],
        [incoming("RESTAURANT", -5000), incoming("RESTAURANT", -5100)],
        true,
      );
      expect(plan.postedInserts).toEqual([]);
      expect(plan.postedTransitions).toEqual([]);
      expect(plan.postedReplacements).toEqual([]);
      expect(plan.warnings).toEqual([]);
    });

    it("Amazon hold retirement: D3b carries a hold to its sole successor despite the page's generic display name", () => {
      // The page's own pending description ("Amazon.com") never overlaps SimpleFIN's
      // fuller descriptor ("AMAZON MKTPL*537NK9DZ2") — the exact mismatch class D4 exists
      // to fix. A single qualifying candidate retires the hold regardless.
      const plan = planBankSnapshotReconciliation(
        [
          existing("feed-amazon", "AMAZON MKTPL*537NK9DZ2", -1377, {
            pending: false,
            externalSource: "api:simplefin",
          }),
          existing("hold-amazon", "Amazon.com", -1377, {
            budgetCategoryId: "shopping",
          }),
        ],
        [],
        [],
        true,
      );
      expect(plan.pendingDeletes).toEqual(["hold-amazon"]);
      expect(plan.pendingCarries).toEqual([
        {
          pendingId: "hold-amazon",
          targetId: "feed-amazon",
          carry: { budgetCategoryId: "shopping" },
        },
      ]);
      expect(plan.warnings).toEqual([]);
    });

    it("ChatGPT/Claude: still picks its own successor over an unrelated same-amount charge when both candidates exist", () => {
      // The production case `feedPairing.ts` exists for, replayed through D3b: a scraped
      // ChatGPT hold vanishes from the page's pending list, and both ChatGPT's own feed
      // row and an unrelated Claude charge at the same amount are on file. Ranking by
      // description still picks ChatGPT — ranking is not the same as no longer checking.
      const plan = planBankSnapshotReconciliation(
        [
          existing("feed-claude", "Claude", -2120, {
            pending: false,
            externalSource: "api:simplefin",
            transactionDate: "2026-08-29",
          }),
          existing("feed-chatgpt", "ChatGPT", -2120, {
            pending: false,
            externalSource: "api:simplefin",
          }),
          existing("hold-chatgpt", "ChatGPT", -2120),
        ],
        [],
        [],
        true,
      );
      expect(plan.pendingDeletes).toEqual(["hold-chatgpt"]);
      expect(plan.pendingCarries).toEqual([
        { pendingId: "hold-chatgpt", targetId: "feed-chatgpt", carry: {} },
      ]);
    });

    it("keeps an ambiguous lost hold instead of guessing, and does not delete it", () => {
      const plan = planBankSnapshotReconciliation(
        [
          existing("posted-1", "DOMINOS 1234", -2100, {
            pending: false,
            externalSource: "api:simplefin",
          }),
          existing("posted-2", "DOMINOS 5678", -2050, {
            pending: false,
            externalSource: "api:simplefin",
          }),
          existing("hold-dominos", "Domino's", -2000),
        ],
        [],
        [],
        true,
      );
      expect(plan.pendingDeletes).toEqual([]);
      expect(plan.pendingCarries).toEqual([]);
      expect(plan.warnings[0]).toContain("Domino's");
      expect(plan.warnings[0]).toContain("Kept");
    });
  });
});

describe("planBankSnapshotReconciliation for a page-sourced account", () => {
  it("inserts a posted charge nothing stored holds (YouTube, 2026-09-22)", () => {
    const plan = planBankSnapshotReconciliation(
      [],
      [incoming("YouTube", -1695, "2026-09-22")],
      [],
      false,
    );
    expect(plan.postedInserts.map((row) => row.description)).toEqual(["YouTube"]);
  });

  it("posts a tipped hold in place, keeping the purchase day (Kim's Nails)", () => {
    const hold = existing("hold", "Kim's Nails III", -5000, {
      transactionDate: "2026-09-19",
    });
    const posted = {
      ...incoming("Kim's Nails III", -6000, "2026-09-19"),
      postedDate: "2026-09-21",
    };
    const plan = planBankSnapshotReconciliation([hold], [posted], [], false);
    expect(plan.postedTransitions).toEqual([
      { existingId: "hold", incoming: posted, amountChanged: true },
    ]);
    expect(plan.postedInserts).toEqual([]);
  });

  it("holds a re-pasted page by identity and inserts nothing", () => {
    const row = incoming("YouTube", -1695, "2026-09-22");
    const stored = existing("stored", "YouTube", -1695, {
      pending: false,
      transactionDate: "2026-09-22",
      postedDate: "2026-09-22",
      externalId: row.externalId,
    });
    const plan = planBankSnapshotReconciliation([stored], [row], [], false);
    expect(plan.postedInserts).toEqual([]);
    expect(plan.postedDuplicates).toHaveLength(1);
  });

  it("inserts a closed statement's rows once, then holds them by identity", () => {
    const closed = [incoming("Shell", -4000, "2026-09-02")];
    const first = planBankSnapshotReconciliation([], [], [], false, closed);
    expect(first.postedInserts).toEqual(closed);

    const stored = existing("stored", "Shell", -4000, {
      pending: false,
      transactionDate: "2026-09-02",
      postedDate: "2026-09-02",
      externalId: closed[0].externalId,
    });
    const again = planBankSnapshotReconciliation([stored], [], [], false, closed);
    expect(again.postedInserts).toEqual([]);
  });

  it("leaves a closed statement as evidence only for a feed-covered account", () => {
    const closed = [incoming("Shell", -4000, "2026-09-02")];
    const plan = planBankSnapshotReconciliation([], [], [], true, closed);
    expect(plan.postedInserts).toEqual([]);
  });

  it("posts a hold the closed statement lists instead of marking it", () => {
    const hold = existing("hold", "Chewy.com", -2000, {
      transactionDate: "2026-09-13",
    });
    const closed = incoming("Chewy.com", -2000, "2026-09-13");
    const plan = planBankSnapshotReconciliation([hold], [], [], false, [closed]);
    expect(plan.postedTransitions).toEqual([
      { existingId: "hold", incoming: closed, amountChanged: false },
    ]);
    expect(plan.postedAtBankMarks).toEqual([]);
    expect(plan.postedInserts).toEqual([]);
  });

  it("never inserts a row posted on or before the source start, and names it", () => {
    const old = incoming("Old", -500, "2026-09-21");
    const fresh = incoming("Fresh", -600, "2026-09-22");
    const plan = planBankSnapshotReconciliation(
      [],
      [old, fresh],
      [],
      false,
      [incoming("Older", -700, "2026-09-10")],
      "2026-09-21",
    );
    expect(plan.postedInserts).toEqual([fresh]);
    expect(plan.postedBeforeSourceStart.map((row) => row.description)).toEqual([
      "Old",
      "Older",
    ]);
  });
});
