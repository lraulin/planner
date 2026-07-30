import { describe, expect, it } from "vitest";
import {
  coerceExercisePrefs,
  formatEquipmentBadge,
  effectiveUnilateral,
} from "./equipment";

describe("formatEquipmentBadge", () => {
  it("labels bars and unilateral", () => {
    expect(formatEquipmentBadge("barbell", 45, false)).toBe("Barbell · Olympic 45");
    expect(formatEquipmentBadge("barbell", 15, false)).toBe("Barbell · EZ 15");
    expect(formatEquipmentBadge("dumbbell", 45, true)).toBe("Dumbbell · L/R");
    expect(formatEquipmentBadge("bodyweight", 45, false)).toBe("Bodyweight");
  });
});

describe("coerceExercisePrefs", () => {
  it("clears unilateral on barbell", () => {
    expect(
      coerceExercisePrefs({
        equipment: "barbell",
        barWeight: 15,
        unilateral: true,
      }),
    ).toEqual({ equipment: "barbell", barWeight: 15, unilateral: false });
  });

  it("restores default bar when barbell has 0", () => {
    expect(
      coerceExercisePrefs({
        equipment: "barbell",
        barWeight: 0,
        unilateral: false,
      }).barWeight,
    ).toBe(45);
  });
});

describe("effectiveUnilateral", () => {
  it("only allows L/R on DB or BW", () => {
    expect(effectiveUnilateral("dumbbell", true)).toBe(true);
    expect(effectiveUnilateral("barbell", true)).toBe(false);
  });
});
