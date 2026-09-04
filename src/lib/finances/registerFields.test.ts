import { describe, expect, it } from "vitest";
import { optionsFilter } from "@/lib/grid/customFilter";
import {
  registerFields,
  reseedAllTransactionsDate,
  THIS_MONTH_DATE_FILTER,
} from "./registerFields";

describe("registerFields — amount filter kind", () => {
  it("filters Amount and Balance as numbers, not formatted text", () => {
    // A text kind offers contains / starts-with on "$100.00", so "greater than 50"
    // is not even an operator. Number is the kind Custom criteria uses for > / <.
    expect(registerFields.amount.filterKind).toBe("number");
    expect(registerFields.balance.filterKind).toBe("number");
  });
});

describe("registerFields — Date vs Posted", () => {
  it("gives Date the calendar bands and leaves Posted on deadline date", () => {
    expect(registerFields.date.filterKind).toBe("calendar");
    expect(registerFields.posted.filterKind).toBe("date");
  });
});

describe("reseedAllTransactionsDate", () => {
  it("writes This Month over a leftover Date band and keeps other columns", () => {
    const next = reseedAllTransactionsDate({
      date: optionsFilter(["past"]),
      payee: optionsFilter(["value:Walmart"]),
    });
    expect(next.date).toEqual(THIS_MONTH_DATE_FILTER);
    expect(next.payee).toEqual(optionsFilter(["value:Walmart"]));
  });
});
