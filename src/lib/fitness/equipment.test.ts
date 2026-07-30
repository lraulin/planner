import { describe, expect, it } from "vitest";
import {
  coerceExercisePrefs,
  formatEquipmentBadge,
  formatExerciseSelectLabel,
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

describe("formatExerciseSelectLabel", () => {
  it("puts equipment after the name so variants share a short name", () => {
    expect(formatExerciseSelectLabel("Curl", "dumbbell", 45, false)).toBe(
      "Curl · Dumbbell",
    );
    expect(formatExerciseSelectLabel("Curl", "barbell", 15, false)).toBe(
      "Curl · Barbell · EZ 15",
    );
    expect(formatExerciseSelectLabel("Pull-up", "bodyweight", 45, false)).toBe(
      "Pull-up · Bodyweight",
    );
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
