import { describe, expect, it } from "vitest";
import { parseReportSettings } from "./reportSettings";

const categories = [
  { id: "cat-food", name: "Food" },
  { id: "cat-rent", name: "Rent" },
];
const payees = [
  { id: "payee-a", name: "Amazon" },
  { id: "payee-b", name: "BigBox" },
];

describe("parseReportSettings", () => {
  it("defaults everything from an empty value", () => {
    expect(parseReportSettings(null, categories, payees)).toEqual({
      report: "spending",
      scope: "living",
      window: "12m",
      month: null,
      accountIds: [],
      categoryIds: [],
      payeeIds: [],
      migrationWarnings: [],
    });
  });

  it("keeps a valid report/scope/window and rejects an unknown one", () => {
    expect(
      parseReportSettings({ report: "balances", scope: "all" }, categories, payees),
    ).toMatchObject({ report: "balances", scope: "all" });

    // The plausible mistake: not validating against the allowed set and letting a stale
    // or hand-edited value through as-is.
    expect(
      parseReportSettings({ report: "not-a-report-kind" }, categories, payees),
    ).toMatchObject({ report: "spending" });
  });

  it("parses a YYYY-MM month into the stored key, and drops garbage", () => {
    expect(parseReportSettings({ month: "2026-08" }, categories, payees).month).toBe(
      "2026-08-01",
    );
    expect(
      parseReportSettings({ month: "garbage" }, categories, payees).month,
    ).toBeNull();
  });

  it("falls back to the legacy `accounts` key when `accountIds` is absent", () => {
    expect(
      parseReportSettings({ accounts: ["acct-1"] }, categories, payees).accountIds,
    ).toEqual(["acct-1"]);
  });

  it("prefers `accountIds` over the legacy `accounts` key when both are present", () => {
    expect(
      parseReportSettings(
        { accountIds: ["acct-new"], accounts: ["acct-old"] },
        categories,
        payees,
      ).accountIds,
    ).toEqual(["acct-new"]);
  });

  it("migrates legacy category/merchant names to ids", () => {
    const result = parseReportSettings(
      { categories: ["Food"], merchants: ["Amazon"] },
      categories,
      payees,
    );
    expect(result.categoryIds).toEqual(["cat-food"]);
    expect(result.payeeIds).toEqual(["payee-a"]);
    expect(result.migrationWarnings).toEqual([]);
  });

  it("reports a legacy name that no longer resolves as a migration warning", () => {
    const result = parseReportSettings(
      { categories: ["Renamed Category"], merchants: ["Gone Payee"] },
      categories,
      payees,
    );
    expect(result.categoryIds).toEqual([]);
    expect(result.payeeIds).toEqual([]);
    expect(result.migrationWarnings).toEqual(["Renamed Category", "Gone Payee"]);
  });

  it("prefers an already-migrated `categoryIds`/`payeeIds` over re-running the migration", () => {
    // An explicitly empty array here means "no categories selected", not "not yet
    // migrated" — it must not fall back to the legacy-name migration.
    const result = parseReportSettings(
      { categoryIds: [], categories: ["Food"] },
      categories,
      payees,
    );
    expect(result.categoryIds).toEqual([]);
  });
});
