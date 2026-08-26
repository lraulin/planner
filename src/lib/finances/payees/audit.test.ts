import { describe, expect, it } from "vitest";
import { formatPayeeRepairAudit, type PayeeRepairAudit } from "./audit";

const EMPTY: PayeeRepairAudit = { aliasCount: 0, proposals: [], damaged: [] };

describe("formatPayeeRepairAudit", () => {
  it("says plainly that it wrote nothing", () => {
    expect(formatPayeeRepairAudit(EMPTY)).toContain("Nothing was written.");
  });

  it("reports each proposal with its counts and destinations", () => {
    const report = formatPayeeRepairAudit({
      aliasCount: 2,
      proposals: [
        {
          source: {
            alias: "WAWA 592CALIFORNIAMD",
            payeeId: "a",
            payeeName: "WAWA 592CALIFORNIAMD",
            transactionCount: 6,
          },
          target: {
            alias: "WAWA",
            payeeId: "b",
            payeeName: "WAWA",
            transactionCount: 40,
          },
          glued: "CALIFORNIAMD",
          sourceEnvelopes: [{ name: "General Spending", count: 6 }],
          targetEnvelopes: [{ name: "Gas", count: 31 }],
        },
      ],
      damaged: [],
    });
    expect(report).toContain("WAWA 592CALIFORNIAMD  →  WAWA");
    expect(report).toContain("glued on: CALIFORNIAMD");
    expect(report).toContain("6 charges — General Spending (6)");
    expect(report).toContain("40 charges — Gas (31)");
  });

  it("names the damaged payees the normalizer left behind", () => {
    const report = formatPayeeRepairAudit({
      aliasCount: 1,
      proposals: [],
      damaged: [{ name: "P", alias: "P", transactionCount: 6 }],
    });
    expect(report).toContain('"P" (spelling "P") — 6 charges');
    expect(report).toContain("Damaged names: 1");
  });

  it("says none rather than printing an empty list", () => {
    const report = formatPayeeRepairAudit(EMPTY);
    expect(report).toContain("City/state merge proposals: 0");
    expect(report).toContain("no spelling resolves to a merchant");
    expect(report).toContain("no payee is too short");
  });
});
