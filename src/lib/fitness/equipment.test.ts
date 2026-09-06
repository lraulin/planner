import { describe, expect, it } from "vitest";
import {
  coerceExercisePrefs,
  formatEquipmentBadge,
  formatEquipmentShort,
  formatExerciseSelectLabel,
  effectiveUnilateral,
} from "./equipment";

describe("formatEquipmentBadge", () => {
  it("labels bars and unilateral", () => {
    expect(formatEquipmentBadge("barbell", 45, false)).toBe("Barbell · Olympic 45");
    expect(formatEquipmentBadge("barbell", 15, false)).toBe("Barbell · EZ 15");
    expect(formatEquipmentBadge("dumbbell", 45, true)).toBe("Dumbbell · L/R");
    expect(formatEquipmentBadge("kettlebell", 45, true)).toBe("Kettlebell · L/R");
    expect(formatEquipmentBadge("club", 45, true)).toBe("Club · L/R");
    expect(formatEquipmentBadge("mace", 45, false)).toBe("Mace");
    expect(formatEquipmentBadge("bodyweight", 45, false)).toBe("Bodyweight");
  });
});

describe("formatEquipmentShort", () => {
  // Short is the picker tag; badge is the catalog/session hint. They are deliberately not
  // the same function, and nothing pinned the two places they diverge — so unifying them
  // would have gone unnoticed.
  it("says nothing about a standard bar, where the badge names it", () => {
    expect(formatEquipmentShort("barbell", 45, false)).toBe("Barbell");
    expect(formatEquipmentBadge("barbell", 45, false)).toBe("Barbell · Olympic 45");
  });

  it("separates L/R with a space, where the badge uses a middot", () => {
    expect(formatEquipmentShort("dumbbell", 45, true)).toBe("Dumbbell L/R");
    expect(formatEquipmentBadge("dumbbell", 45, true)).toBe("Dumbbell · L/R");
  });

  it("names a bar that is not the standard one, since that is the surprising case", () => {
    expect(formatEquipmentShort("barbell", 15, false)).toBe("Barbell · EZ 15");
    expect(formatEquipmentShort("barbell", 35, false)).toBe("Barbell · Training 35");
    expect(formatEquipmentShort("barbell", 55, false)).toBe("Barbell · 55 lb");
  });

  it("ignores unilateral on a barbell, which cannot be one", () => {
    expect(formatEquipmentShort("barbell", 45, true)).toBe("Barbell");
  });

  it("drops L/R for equipment that does not allow it", () => {
    expect(formatEquipmentShort("bodyweight", 45, false)).toBe("Bodyweight");
    expect(formatEquipmentShort("mace", 45, true)).toBe("Mace L/R");
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
    expect(formatExerciseSelectLabel("Swing", "kettlebell", 45, false)).toBe(
      "Swing · Kettlebell",
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

  it("keeps unilateral on free weights", () => {
    expect(
      coerceExercisePrefs({
        equipment: "kettlebell",
        barWeight: 0,
        unilateral: true,
      }).unilateral,
    ).toBe(true);
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
    expect(effectiveUnilateral("kettlebell", true)).toBe(true);
    expect(effectiveUnilateral("club", true)).toBe(true);
    expect(effectiveUnilateral("mace", true)).toBe(true);
    expect(effectiveUnilateral("bodyweight", true)).toBe(true);
    expect(effectiveUnilateral("barbell", true)).toBe(false);
  });
});
