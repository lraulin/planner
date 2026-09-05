import { asRecord, asOneOf, asStringArray, asString } from "@/lib/settings/parse";
import { INSIGHTS_WINDOW_KEYS } from "./insightsFilter";
import { migrateReportNames } from "./reports";
import { monthKeyFromParam } from "./budget/envelope";
export function parseReportSettings(
  value: unknown,
  categories: readonly { id: string; name: string }[],
  payees: readonly { id: string; name: string }[],
) {
  const row = asRecord(value) ?? {};
  const categoryMigration = migrateReportNames(
    asStringArray(row.categories, []),
    categories,
  );
  const payeeMigration = migrateReportNames(asStringArray(row.merchants, []), payees);
  return {
    report: asOneOf(
      row.report,
      ["spending", "balances", "cashflow"] as const,
      "spending",
    ),
    scope: asOneOf(row.scope, ["living", "savings", "all"] as const, "living"),
    window: asOneOf(row.window, INSIGHTS_WINDOW_KEYS, "12m"),
    month: monthKeyFromParam(asString(row.month, "")),
    accountIds: asStringArray(row.accountIds, asStringArray(row.accounts, [])),
    categoryIds: asStringArray(row.categoryIds, categoryMigration.ids),
    payeeIds: asStringArray(row.payeeIds, payeeMigration.ids),
    migrationWarnings: asStringArray(row.migrationWarnings, [
      ...categoryMigration.unresolved,
      ...payeeMigration.unresolved,
    ]),
  };
}
