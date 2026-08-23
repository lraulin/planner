import { describe, expect, it } from "vitest";
import { rewriteMergedPayeeIds, storedSchedulePayeeIds } from "./references";

describe("storedSchedulePayeeIds", () => {
  it("finds ids in is and oneOf conditions without trusting the rest of the blob", () => {
    expect(
      storedSchedulePayeeIds([
        { field: "payee", op: "is", value: "payee-a" },
        { field: "payee", op: "broken", value: ["payee-a", "payee-b", 12] },
        { field: "amount", op: "is", value: -1000 },
      ]),
    ).toEqual(["payee-a", "payee-b"]);
  });
});

describe("rewriteMergedPayeeIds", () => {
  const merged = new Set(["old-a", "old-b"]);

  it("returns null when nothing referenced a merged payee", () => {
    // The caller skips its write on null. Returning the array unchanged instead would make
    // every merge touch every schedule and every rule, bumping updated_at on rows nothing
    // happened to.
    expect(
      rewriteMergedPayeeIds(
        [{ field: "payee", op: "is", value: "someone-else" }],
        merged,
        "survivor",
      ),
    ).toBeNull();
  });

  it("points an is condition at the survivor", () => {
    expect(
      rewriteMergedPayeeIds(
        [{ field: "payee", op: "is", value: "old-a" }],
        merged,
        "survivor",
      ),
    ).toEqual([{ field: "payee", op: "is", value: "survivor" }]);
  });

  it("de-duplicates when one condition listed both merged payees", () => {
    /*
     * The trap: a schedule or rule deliberately spanning two payees that then become one.
     * Mapping without de-duplicating leaves the survivor named twice, which every `oneOf`
     * reader would treat as a set anyway — until something counts the list.
     */
    expect(
      rewriteMergedPayeeIds(
        [{ field: "payee", op: "oneOf", value: ["old-a", "old-b", "keep"] }],
        merged,
        "survivor",
      ),
    ).toEqual([{ field: "payee", op: "oneOf", value: ["survivor", "keep"] }]);
  });

  it("leaves every non-payee condition exactly as it found it", () => {
    const conditions = [
      { field: "amount", op: "isbetween", value: { num1: -5000, num2: -1000 } },
      { field: "payee", op: "is", value: "old-a" },
      { field: "merchant", op: "matches", value: "^COSTCO" },
    ];

    expect(rewriteMergedPayeeIds(conditions, merged, "survivor")).toEqual([
      conditions[0],
      { field: "payee", op: "is", value: "survivor" },
      conditions[2],
    ]);
  });

  it("preserves the other keys of the condition it rewrites", () => {
    // Rebuilding the condition from scratch rather than spreading it would silently drop the
    // op, and an `oneOf` that became an `is` would then match one payee instead of several.
    expect(
      rewriteMergedPayeeIds(
        [{ field: "payee", op: "oneOf", value: ["old-a"] }],
        merged,
        "survivor",
      ),
    ).toEqual([{ field: "payee", op: "oneOf", value: ["survivor"] }]);
  });

  it("returns null for a blob that is not an array", () => {
    expect(rewriteMergedPayeeIds(null, merged, "survivor")).toBeNull();
    expect(rewriteMergedPayeeIds({ field: "payee" }, merged, "survivor")).toBeNull();
  });
});
