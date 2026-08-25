import { describe, expect, it } from "vitest";
import {
  groupEnvelopeOptions,
  parseNewEnvelopeKind,
  type EnvelopePickerOption,
} from "./groupEnvelopeOptions";

const envelopes: EnvelopePickerOption[] = [
  { id: "pay", label: "Paycheck", name: "Paycheck", kind: "income" },
  { id: "rent", label: "Rent", name: "Rent", kind: "bill" },
  { id: "food", label: "Groceries", name: "Groceries", kind: "spending" },
  { id: "house", label: "House fund", name: "House fund", kind: "savings" },
];

describe("groupEnvelopeOptions", () => {
  it("keeps Budget page section order and leaves empty groups in place", () => {
    const grouped = groupEnvelopeOptions([
      { id: "rent", label: "Rent", name: "Rent", kind: "bill" },
    ]);
    expect(grouped.map((entry) => entry.section.label)).toEqual([
      "Income",
      "Regular spending",
      "Bills",
      "Savings",
    ]);
    expect(grouped.map((entry) => entry.envelopes.map((row) => row.id))).toEqual([
      [],
      [],
      ["rent"],
      [],
    ]);
  });

  it("puts each envelope in exactly one group", () => {
    const grouped = groupEnvelopeOptions(envelopes);
    expect(grouped.flatMap((entry) => entry.envelopes.map((row) => row.id))).toEqual([
      "pay",
      "food",
      "rent",
      "house",
    ]);
  });
});

describe("parseNewEnvelopeKind", () => {
  it("reads the New {type}… sentinels and nothing else", () => {
    expect(parseNewEnvelopeKind("__new__:bill")).toBe("bill");
    expect(parseNewEnvelopeKind("__new__:spending")).toBe("spending");
    expect(parseNewEnvelopeKind("rent")).toBeNull();
    expect(parseNewEnvelopeKind("")).toBeNull();
  });
});
