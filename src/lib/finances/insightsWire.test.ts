import { describe, expect, it } from "vitest";
import { packInsightsRows, unpackInsightsRows } from "./insightsWire";
import type { EnvelopeReportRow } from "./reports";

function row(index: number): EnvelopeReportRow {
  const filed = index % 3 !== 0;
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    accountId: `account-${index % 4}`,
    accountName: index % 4 === 0 ? "360 Checking •••2322" : "Capital One •••3448",
    accountKind: index % 4 === 0 ? "checking" : "credit_card",
    transactionDate: `2026-${String((index % 12) + 1).padStart(2, "0")}-15`,
    description: `MERCHANT ${index % 40}`,
    amountCents: index % 7 === 0 ? 250000 : -(index * 13),
    sourceCategory: "",
    derivedFlow: index % 7 === 0 ? "income" : "spend",
    flowOverride: null,
    transferGroupId: index % 50 === 0 ? `transfer-${index}` : null,
    payeeId: filed ? `payee-${index % 40}` : null,
    payeeName: filed ? `Merchant ${index % 40}` : null,
    budgetCategoryName: filed ? `Envelope ${index % 9}` : null,
    budgetCategoryId: filed ? `envelope-${index % 9}` : null,
    groupId: filed ? `group-${index % 3}` : null,
    envelopeKind: filed ? "spending" : null,
    incomeRole: null,
    accountOffBudget: false,
    contributesToBudget: index % 11 !== 0,
  };
}

describe("insights rows on the wire", () => {
  const rows = Array.from({ length: 600 }, (_, index) => row(index));

  it("gives the browser back the rows the server loaded", () => {
    expect(unpackInsightsRows(packInsightsRows(rows))).toEqual(rows);
  });

  it("sends an absent envelope name as null, never as a missing key", () => {
    const { budgetCategoryName: _dropped, ...bare } = row(1);
    const [back] = unpackInsightsRows(packInsightsRows([bare]));
    expect(back.budgetCategoryName).toBeNull();
  });

  it("is a fraction of the keyed payload", () => {
    const packed = JSON.stringify(packInsightsRows(rows)).length;
    expect(packed * 4).toBeLessThan(JSON.stringify(rows).length);
  });
});
