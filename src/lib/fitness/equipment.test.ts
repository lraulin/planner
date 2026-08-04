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
    expect(formatEquipmentBadge("club", 45, true)).toBe("Club · L/R");
    expect(formatEquipmentBadge("mace", 45, false)).toBe("Mace");
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
    expect(formatExerciseSelectLabel("Mill", "club", 45, true)).toBe("Mill · Club L/R");
    expect(formatExerciseSelectLabel("360", "mace", 45, false)).toBe("360 · Mace");
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

  it("keeps unilateral on club and mace", () => {
    expect(
      coerceExercisePrefs({
        equipment: "club",
        barWeight: 0,
        unilateral: true,
      }).unilateral,
    ).toBe(true);
    expect(
      coerceExercisePrefs({
        equipment: "mace",
        barWeight: 0,
        unilateral: true,
      }).unilateral,
    ).toBe(true);
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
  it("allows L/R on free weights and bodyweight, not barbell", () => {
    expect(effectiveUnilateral("dumbbell", true)).toBe(true);
    expect(effectiveUnilateral("club", true)).toBe(true);
    expect(effectiveUnilateral("mace", true)).toBe(true);
    expect(effectiveUnilateral("bodyweight", true)).toBe(true);
    expect(effectiveUnilateral("barbell", true)).toBe(false);
  });
});
