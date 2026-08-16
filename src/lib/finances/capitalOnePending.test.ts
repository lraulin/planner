import { describe, expect, it } from "vitest";
import {
  looksLikePlannerPending,
  parsePlannerPending,
  parsePurchasedDate,
} from "./capitalOnePending";

const LIVE = [
  "# planner-pending v1",
  "# account=3448",
  "# scraped=2026-08-16",
  "date\tdescription\tcategory\tamount",
  "2026-08-16\tChipotle\tDining\t16.91",
  "2026-08-16\tWalmart\tGrocery\t189.53",
  "2026-08-16\tLINK.COM* SIMPLEFIN BR\tInternet\t1.59",
  "2026-08-16\tSheetz\tGas/Automotive\t11.66",
  "2026-08-16\tSheetz\tGas/Automotive\t24.45",
  "2026-08-16\tSimpliSafe\tOther Services\t34.97",
  "2026-08-16\tSheetz\tGas/Automotive\t30.07",
  "2026-08-16\tSheetz\tGas/Automotive\t13.53",
  "2026-08-16\tSheetz\tGas/Automotive\t24.45",
  "2026-08-16\tPizza Hut\tDining\t32.52",
  "",
].join("\n");

describe("parsePurchasedDate", () => {
  it("reads Cap One's drawer wording without a Date round-trip", () => {
    expect(parsePurchasedDate("Sun, Aug 16, 2026")).toBe("2026-08-16");
    expect(parsePurchasedDate("2026-08-16")).toBe("2026-08-16");
  });

  it("rejects a day that does not exist", () => {
    expect(parsePurchasedDate("Sun, Feb 31, 2026")).toBeNull();
    expect(parsePurchasedDate("not a date")).toBeNull();
  });
});

describe("parsePlannerPending", () => {
  it("negates the bank's unsigned charges and keeps two identical Sheetz rows", () => {
    const result = parsePlannerPending(LIVE, "2026-08-16");
    if (!result.ok) throw new Error(result.error);

    expect(result.payload.last4).toBe("3448");
    expect(result.payload.rows).toHaveLength(10);
    expect(result.payload.rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(
      -37968,
    );
    expect(
      result.payload.rows.filter((row) => row.description === "Sheetz"),
    ).toHaveLength(5);

    const twins = result.payload.rows.filter(
      (row) => row.description === "Sheetz" && row.amountCents === -2445,
    );
    expect(twins.map((row) => row.externalId)).toEqual([
      "3448|SHEETZ|2445|0",
      "3448|SHEETZ|2445|1",
    ]);
  });

  it("uses the scrape day when a row has no date", () => {
    const text = [
      "# planner-pending v1",
      "# account=3448",
      "# scraped=2026-08-16",
      "description\tamount",
      "Chipotle\t16.91",
    ].join("\n");
    const result = parsePlannerPending(text, "2026-01-01");
    if (!result.ok) throw new Error(result.error);
    expect(result.payload.rows[0].dateKey).toBe("2026-08-16");
  });

  it("reads the drawer date form in the date column", () => {
    const text = [
      "# planner-pending v1",
      "# account=3448",
      "date\tdescription\tamount",
      "Sun, Aug 16, 2026\tChipotle\t16.91",
    ].join("\n");
    const result = parsePlannerPending(text, "2026-08-16");
    if (!result.ok) throw new Error(result.error);
    expect(result.payload.rows[0].dateKey).toBe("2026-08-16");
  });

  it("does not flip an amount that is already signed", () => {
    const text = [
      "# planner-pending v1",
      "# account=3448",
      "# scraped=2026-08-16",
      "description\tamount",
      "Chipotle\t-16.91",
    ].join("\n");
    const result = parsePlannerPending(text, "2026-08-16");
    if (!result.ok) throw new Error(result.error);
    expect(result.payload.rows[0].amountCents).toBe(-1691);
  });

  it("refuses a paste that is not tagged", () => {
    expect(looksLikePlannerPending("Chipotle\t16.91")).toBe(false);
    expect(parsePlannerPending("Chipotle\t16.91", "2026-08-16").ok).toBe(false);
  });
});
