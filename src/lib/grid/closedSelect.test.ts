import { describe, expect, it } from "vitest";
import { closedSelectOptions } from "./closedSelect";

const OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
] as const;

describe("closedSelectOptions", () => {
  it("keeps only the selected option while the select is closed", () => {
    expect(closedSelectOptions(false, OPTIONS, "waiting")).toEqual([
      { value: "waiting", label: "Waiting" },
    ]);
  });

  it("returns the full list once the select is focused", () => {
    expect(closedSelectOptions(true, OPTIONS, "waiting")).toEqual(OPTIONS);
  });

  it("returns the full list when the value is not in the options", () => {
    expect(closedSelectOptions(false, OPTIONS, "completed")).toEqual(OPTIONS);
  });
});
