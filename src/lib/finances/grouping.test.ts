import { describe, expect, it } from "vitest";
import { groupTransactions, transactionDatePart } from "./grouping";
import type { TransactionListRow } from "./types";

function row(
  id: string,
  date: string,
  extras: Partial<TransactionListRow> = {},
): TransactionListRow {
  return {
    id,
    accountId: "acct",
    accountName: extras.accountName ?? "Checking",
    transactionDate: date,
    postedDate: null,
    pending: false,
    description: extras.description ?? id,
    amountCents: extras.amountCents ?? -100,
    sourceCategory: "",
    category: extras.category ?? null,
    derivedCategory: extras.derivedCategory ?? null,
    derivedFlow: extras.derivedFlow ?? null,
    flowOverride: extras.flowOverride ?? null,
    excludeFromBaseline: extras.excludeFromBaseline ?? false,
    eventLabel: extras.eventLabel ?? "",
    notes: "",
    balanceAfterCents: null,
  };
}

describe("transactionDatePart", () => {
  it("reads year and month from the calendar-day string, not a Date", () => {
    expect(transactionDatePart("2023-12-22", "year")).toEqual({
      key: "2023",
      label: "2023",
      rank: 2023,
    });
    expect(transactionDatePart("2023-12-22", "month")).toEqual({
      key: "12",
      label: "December",
      rank: 12,
    });
  });

  it("rejects a value that is not a YYYY-MM-DD key", () => {
    expect(transactionDatePart("12/22/2023", "year")).toBeNull();
    expect(transactionDatePart("", "month")).toBeNull();
  });
});

describe("groupTransactions", () => {
  it("returns a flat list when grouping is off", () => {
    const rows = [row("a", "2023-12-01"), row("b", "2023-11-01")];
    const grouped = groupTransactions(rows, []);
    expect(grouped.every((entry) => entry.kind === "node")).toBe(true);
    expect(grouped.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("nests year then month, newest first, and omits a month that has no rows", () => {
    const rows = [
      row("jan", "2024-01-05"),
      row("nov", "2023-11-10"),
      row("wedding", "2023-12-22"),
    ];
    // Drop December — the gap the register could not show when it was a flat list.
    const withoutDecember = rows.filter((entry) => entry.id !== "wedding");
    const grouped = groupTransactions(withoutDecember, ["year", "month"]);

    const headers = grouped
      .filter((entry) => entry.kind === "group")
      .map((entry) => (entry.kind === "group" ? entry.label : ""));
    expect(headers).toEqual(["2024", "January", "2023", "November"]);
    expect(headers).not.toContain("December");
  });

  it("counts the rows under each header, not the months of the year", () => {
    const grouped = groupTransactions(
      [row("a", "2023-12-01"), row("b", "2023-12-15"), row("c", "2023-11-01")],
      ["year", "month"],
    );
    const year = grouped.find(
      (entry) => entry.kind === "group" && entry.label === "2023",
    );
    const december = grouped.find(
      (entry) => entry.kind === "group" && entry.label === "December",
    );
    expect(year?.kind === "group" && year.count).toBe(3);
    expect(december?.kind === "group" && december.count).toBe(2);
  });

  it("groups by account alphabetically and category by its effective value", () => {
    const grouped = groupTransactions(
      [
        row("a", "2024-01-01", { accountName: "Savings", category: "Rent" }),
        // No category of its own and nothing derived: `Uncategorized` is a real bucket
        // rather than an empty one, and it is the same word the dashboard uses.
        row("b", "2024-01-02", { accountName: "Checking", category: null }),
        // The classifier's answer groups too — otherwise every classified row would pile
        // up under one header while the dashboard reported categories for all of them.
        row("c", "2024-01-03", {
          accountName: "Checking",
          category: null,
          derivedCategory: "Groceries",
        }),
      ],
      ["account", "category"],
    );
    const headers = grouped
      .filter((entry) => entry.kind === "group")
      .map((entry) => (entry.kind === "group" ? `${entry.depth}:${entry.label}` : ""));
    expect(headers).toEqual([
      "0:Checking",
      "1:Groceries",
      "1:Uncategorized",
      "0:Savings",
      "1:Rent",
    ]);
  });

  it("groups by flow, so a reclassify can be audited in one list", () => {
    const grouped = groupTransactions(
      [
        row("a", "2024-01-01", { derivedFlow: "spend" }),
        row("b", "2024-01-02", { derivedFlow: "internal_transfer" }),
        // The user disagreed; the override is what groups.
        row("c", "2024-01-03", { derivedFlow: "spend", flowOverride: "refund" }),
      ],
      ["flow"],
    );
    const headers = grouped
      .filter((entry) => entry.kind === "group")
      .map((entry) => (entry.kind === "group" ? entry.label : ""));
    expect(headers).toEqual(["Refund", "Spend", "Transfer (own accounts)"]);
  });
});
