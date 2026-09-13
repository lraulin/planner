import { describe, expect, it } from "vitest";
import type { ParsedBankSnapshotRow } from "./bankSnapshot";
import {
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
    );
    expect(plan.postedInserts).toHaveLength(1);
    expect(plan.postedCoveredByFeed).toBe(0);
  });

  it("owns everything when no feed has ever delivered this account", () => {
    const plan = planBankSnapshotReconciliation(
      [],
      [incoming("CVS", -2284, "2020-01-01")],
      [],
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
    );
    expect(plan.postedTransitions).toEqual([]);
    expect(plan.postedInserts).toHaveLength(1);
  });

  it("replaces only browser pending and leaves SimpleFIN stored for expiry fallback", () => {
    const plan = planBankSnapshotReconciliation(
      [
        existing("old-browser", "OLD", -100),
        existing("simplefin", "SIMPLEFIN ONLY", -200, {
          externalSource: "api:simplefin",
        }),
      ],
      [],
      [incoming("NEW", -300)],
    );
    expect(plan.pendingDeletes).toEqual(["old-browser"]);
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

  it("D3b: removes a vanished duplicate hold with a warning when there is no successor", () => {
    const plan = planBankSnapshotReconciliation(
      [existing("hold-xfinity", "XFINITY", -8900)],
      [],
      [],
    );
    expect(plan.pendingDeletes).toEqual(["hold-xfinity"]);
    expect(plan.pendingCarries).toEqual([]);
    expect(plan.warnings[0]).toContain("XFINITY");
  });
});
