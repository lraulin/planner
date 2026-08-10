import { describe, expect, it } from "vitest";
import {
  MAX_META_CHIPS,
  metricMetaChips,
  metricPriorityText,
  metricTrailingDate,
} from "./compactRow";

const base = {
  active: true,
  lastValue: null as number | null,
  objectiveTarget: null as number | null,
  units: "",
  category: "",
};

describe("metricPriorityText", () => {
  it("is empty with no letter, even when a rank survives from an earlier edit", () => {
    expect(metricPriorityText({ priorityLetter: null, priorityRank: 2 })).toBe("");
  });

  it("is the letter alone when unranked", () => {
    expect(metricPriorityText({ priorityLetter: "B", priorityRank: null })).toBe("B");
  });

  it("joins letter and rank", () => {
    expect(metricPriorityText({ priorityLetter: "A", priorityRank: 1 })).toBe("A1");
  });
});

describe("metricMetaChips", () => {
  it("says so when there is nothing tracked yet", () => {
    expect(metricMetaChips(base)).toEqual(["No entries"]);
  });

  it("puts the current value first and appends units", () => {
    expect(metricMetaChips({ ...base, lastValue: 72.5, units: "kg" })).toEqual([
      "72.5 kg",
    ]);
  });

  it("labels the target so it cannot be read as the value", () => {
    expect(
      metricMetaChips({ ...base, lastValue: 72.5, objectiveTarget: 70, units: "kg" }),
    ).toEqual(["72.5 kg", "Target 70 kg"]);
  });

  it("leads with Inactive, because Active only can be switched off", () => {
    expect(metricMetaChips({ ...base, active: false, lastValue: 3 })[0]).toBe(
      "Inactive",
    );
  });

  it("drops category rather than overflowing the line", () => {
    const chips = metricMetaChips({
      active: false,
      lastValue: 3,
      objectiveTarget: 10,
      units: "",
      category: "Health",
    });
    expect(chips).toHaveLength(MAX_META_CHIPS);
    expect(chips).not.toContain("Health");
  });

  it("keeps category when there is room, without whitespace-only chips", () => {
    expect(metricMetaChips({ ...base, lastValue: 3, category: "  Health  " })).toEqual([
      "3",
      "Health",
    ]);
    expect(metricMetaChips({ ...base, lastValue: 3, category: "   " })).toEqual(["3"]);
  });

  it("does not paste a stray space on when the metric has no units", () => {
    expect(metricMetaChips({ ...base, lastValue: 3, objectiveTarget: 4 })).toEqual([
      "3",
      "Target 4",
    ]);
  });
});

describe("metricTrailingDate", () => {
  it("is null when nothing has been logged", () => {
    expect(metricTrailingDate({ lastDate: null }, "M/D/YYYY")).toBeNull();
  });

  it("formats the date key with the supplied display preference", () => {
    expect(metricTrailingDate({ lastDate: "2026-08-04" }, "D MMMM YYYY")).toBe(
      "4 August 2026",
    );
  });
});
