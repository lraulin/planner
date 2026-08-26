import { describe, expect, it } from "vitest";
import {
  evidenceStatusCopy,
  isDamagedPayeeName,
  payeeEvidence,
  payeeEvidenceRows,
  type EvidenceCharge,
  type EvidencePayee,
} from "./evidence";

const GENERAL = "general";
const SPOTIFY = "spotify";

const NAMES: Record<string, string> = {
  [GENERAL]: "General Spending",
  [SPOTIFY]: "Spotify",
};
const nameOf = (id: string) => NAMES[id] ?? null;

function charges(...specs: (string | null)[]): EvidenceCharge[] {
  return specs.map((categoryId, index) => ({
    id: `t${index}`,
    categoryId,
    eligible: true,
  }));
}

function payee(overrides: Partial<EvidencePayee> = {}): EvidencePayee {
  return {
    id: "p1",
    name: "AMAZON MKTPL",
    claimedBudgetCategoryId: null,
    defaultBudgetCategoryId: null,
    autoCategoryMode: "learn",
    charges: [],
    ...overrides,
  };
}

describe("payeeEvidence", () => {
  it("counts what is filed here and what is unfiled anywhere", () => {
    const row = payeeEvidence(
      GENERAL,
      payee({ charges: charges(GENERAL, GENERAL, null, SPOTIFY) }),
      nameOf,
    );
    expect(row.filedCount).toBe(2);
    expect(row.unfiledCount).toBe(1);
  });

  it("does not count ineligible rows as unfiled — they can never be filed", () => {
    const row = payeeEvidence(
      GENERAL,
      payee({
        charges: [
          { id: "a", categoryId: GENERAL, eligible: true },
          { id: "b", categoryId: null, eligible: false },
        ],
      }),
      nameOf,
    );
    expect(row.unfiledCount).toBe(0);
    expect(row.status).toEqual({ kind: "none" });
  });

  it("reports a held first default with the count that is blocking it", () => {
    // The Apple incident: 12 of 292 filed by amount must not teach the payee.
    const row = payeeEvidence(
      GENERAL,
      payee({
        name: "APPLE/BILL",
        charges: charges(...Array(12).fill(GENERAL), ...Array(280).fill(null)),
      }),
      nameOf,
    );
    expect(row.status).toEqual({ kind: "held", unfiledCount: 280 });
    expect(evidenceStatusCopy(row)).toBe("held: 280 charges still unfiled");
  });

  it("reports an applied default once one is stored", () => {
    const row = payeeEvidence(
      GENERAL,
      payee({
        defaultBudgetCategoryId: GENERAL,
        charges: charges(GENERAL, null),
      }),
      nameOf,
    );
    expect(row.status).toEqual({ kind: "applied", source: "learned" });
    expect(row.unfiledCount).toBe(1);
  });

  it("distinguishes a fixed default, a claim, and an off payee", () => {
    expect(
      payeeEvidence(
        GENERAL,
        payee({ defaultBudgetCategoryId: GENERAL, autoCategoryMode: "fixed" }),
        nameOf,
      ).status,
    ).toEqual({ kind: "applied", source: "fixed" });
    expect(
      payeeEvidence(GENERAL, payee({ claimedBudgetCategoryId: GENERAL }), nameOf)
        .status,
    ).toEqual({ kind: "claimed" });
    expect(
      payeeEvidence(
        GENERAL,
        payee({ autoCategoryMode: "off", charges: charges(null, null) }),
        nameOf,
      ).status,
    ).toEqual({ kind: "off" });
  });

  it("flags a payee whose own destination is a different envelope", () => {
    const row = payeeEvidence(
      SPOTIFY,
      payee({
        name: "PAYPAL TO LEE RAULIN INST XFER",
        defaultBudgetCategoryId: GENERAL,
        charges: charges(SPOTIFY, SPOTIFY),
      }),
      nameOf,
    );
    expect(row.routedTo).toEqual({ id: GENERAL, name: "General Spending" });
  });

  it("leaves routedTo empty when the destination is this envelope", () => {
    const row = payeeEvidence(
      GENERAL,
      payee({ defaultBudgetCategoryId: GENERAL }),
      nameOf,
    );
    expect(row.routedTo).toBeNull();
  });

  it("names a destination that no longer resolves rather than showing an id", () => {
    const row = payeeEvidence(
      GENERAL,
      payee({ defaultBudgetCategoryId: "gone" }),
      nameOf,
    );
    expect(row.routedTo).toEqual({ id: "gone", name: "another envelope" });
  });

  it("flags a name the normalizer destroyed", () => {
    expect(payeeEvidence(GENERAL, payee({ name: "P" }), nameOf).damagedName).toBe(true);
    expect(isDamagedPayeeName("UBR")).toBe(false);
    expect(isDamagedPayeeName(" P ")).toBe(true);
  });
});

describe("payeeEvidenceRows", () => {
  it("ranks by evidence, then by what is waiting, then by name", () => {
    const rows = payeeEvidenceRows(
      GENERAL,
      [
        payee({ id: "a", name: "SPOTIFY", charges: charges(GENERAL) }),
        payee({ id: "b", name: "SPOTIFYUSAI", charges: charges(GENERAL, GENERAL) }),
        payee({ id: "c", name: "P", charges: charges(GENERAL, null) }),
      ],
      nameOf,
    );
    expect(rows.map((row) => row.name)).toEqual(["SPOTIFYUSAI", "P", "SPOTIFY"]);
  });
});

describe("evidenceStatusCopy", () => {
  it("says charge in the singular", () => {
    const row = payeeEvidence(
      GENERAL,
      payee({ charges: charges(GENERAL, null) }),
      nameOf,
    );
    expect(evidenceStatusCopy(row)).toBe("held: 1 charge still unfiled");
  });
});
