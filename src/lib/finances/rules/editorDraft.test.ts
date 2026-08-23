import { describe, expect, it } from "vitest";
import {
  draftConditions,
  storedActions,
  storedConditions,
  type RuleDraftCondition,
} from "./editorDraft";

describe("rule editor drafts", () => {
  it("round-trips regex flags and amount and date ranges", () => {
    const stored = [
      { field: "description", op: "matches", value: { source: "refund", flags: "i" } },
      { field: "amount", op: "isbetween", value: { num1: -5000, num2: -1000 } },
      {
        field: "date",
        op: "isbetween",
        value: { date1: "2026-01-01", date2: "2026-01-31" },
      },
    ];

    expect(storedConditions(draftConditions(stored))).toEqual(stored);
  });

  it("leaves a half-typed amount invalid instead of silently storing zero", () => {
    const draft: RuleDraftCondition = {
      field: "amount",
      op: "is",
      value: "-",
      upperValue: "",
      flags: "",
    };
    expect(storedConditions([draft])).toEqual([
      { field: "amount", op: "is", value: "-" },
    ]);
  });

  it("drops blank actions and trims names", () => {
    expect(
      storedActions([
        { kind: "category", value: "" },
        { kind: "name-payee", value: "  GitHub  " },
      ]),
    ).toEqual([{ op: "name-payee", value: "GitHub" }]);
  });
});
