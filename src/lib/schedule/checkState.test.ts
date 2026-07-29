import { describe, expect, it } from "vitest";
import { checkStateLabel, checkStateMark, nextCheckState } from "./checkState";

describe("nextCheckState", () => {
  it("cycles open → done → missed → open", () => {
    expect(nextCheckState("open")).toBe("done");
    expect(nextCheckState("done")).toBe("missed");
    expect(nextCheckState("missed")).toBe("open");
  });
});

describe("checkStateMark", () => {
  it("maps to empty, check, and X", () => {
    expect(checkStateMark("open")).toBe("");
    expect(checkStateMark("done")).toBe("✓");
    expect(checkStateMark("missed")).toBe("✕");
  });
});

describe("checkStateLabel", () => {
  it("has readable labels", () => {
    expect(checkStateLabel("open")).toBe("Open");
    expect(checkStateLabel("done")).toBe("Done");
    expect(checkStateLabel("missed")).toBe("Missed");
  });
});
