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
    ...over,
  };
}

describe("planBankSnapshotReconciliation", () => {
  it("leaves a posted row the feed already owns to the feed", () => {
    // The 2026-08-29 Capital One snapshot. The page says `Pizza Hut` and dates the charge
    // by the purchase day; the stored row carries the bank descriptor `PIZZA HUT 036874`
    // and the posted day. Neither the description nor the transaction date lines up, and
    // the charge duplicated. SimpleFIN has posted through the 24th, so it owns this day.
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
      "2026-08-24",
    );
    expect(plan.postedCoveredByFeed).toBe(1);
    expect(plan.postedInserts).toEqual([]);
    expect(plan.postedDuplicates).toEqual([]);
  });

  it("inserts a posted row past the watermark that no feed has delivered", () => {
    // `CVS $22.84` on 2026-08-18: the Chase CSV ends 2026-08-10 and SimpleFIN's last Chase
    // transaction is 2026-08-14, so this charge exists in no other feed and is real.
    const plan = planBankSnapshotReconciliation(
      [],
      [incoming("CVS", -2284, "2026-08-18")],
      [],
      "2026-08-14",
    );
    expect(plan.postedInserts).toHaveLength(1);
    expect(plan.postedCoveredByFeed).toBe(0);
  });

  it("owns everything when no feed has ever delivered this account", () => {
    const plan = planBankSnapshotReconciliation(
      [],
      [incoming("CVS", -2284, "2020-01-01")],
      [],
      null,
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
      null,
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
      null,
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
      null,
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
      null,
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
      null,
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
      null,
    );
    expect(plan.postedInserts).toHaveLength(1);
    expect(plan.postedTransitions).toEqual([]);
    expect(plan.warnings[0]).toContain("Could not attach");
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
      null,
    );
    expect(plan.pendingDeletes).toEqual(["old-browser"]);
    expect(plan.pendingInserts).toHaveLength(1);
  });
});
