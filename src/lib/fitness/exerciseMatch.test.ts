import { describe, expect, it } from "vitest";
import {
  exerciseOptionLabel,
  matchExercises,
  resolveExerciseQuery,
  type ExerciseMatchInput,
} from "./exerciseMatch";

function lift(
  id: string,
  name: string,
  equipment: ExerciseMatchInput["equipment"] = "barbell",
  barWeight = 45,
  unilateral = false,
): ExerciseMatchInput {
  return { id, name, equipment, barWeight, unilateral };
}

const catalog = [
  lift("bench", "Bench Press"),
  lift("incline", "Incline Bench Press"),
  lift("curl-bb", "Curl", "barbell", 15),
  lift("curl-db", "Curl", "dumbbell", 0, true),
  lift("rdl", "Romanian Deadlift"),
  lift("pullup", "Pull-up", "bodyweight"),
  lift("swing", "Swing", "kettlebell"),
];

describe("exerciseOptionLabel", () => {
  it("keeps the name clean and hangs equipment off it", () => {
    expect(exerciseOptionLabel(catalog[0])).toBe("Bench Press · Barbell");
    expect(exerciseOptionLabel(catalog[2])).toBe("Curl · Barbell · EZ 15");
    expect(exerciseOptionLabel(catalog[3])).toBe("Curl · Dumbbell L/R");
  });
});

describe("matchExercises", () => {
  it("returns the given order when the query is empty", () => {
    expect(matchExercises(catalog, "  ").map((row) => row.id)).toEqual(
      catalog.map((row) => row.id),
    );
  });

  it("is case-insensitive and matches a name substring", () => {
    expect(matchExercises(catalog, "DEAD").map((row) => row.id)).toEqual(["rdl"]);
  });

  it("ranks a name prefix above a later substring", () => {
    expect(matchExercises(catalog, "bench").map((row) => row.id)).toEqual([
      "bench",
      "incline",
    ]);
  });

  it("matches equipment text in the select label", () => {
    expect(matchExercises(catalog, "dumbbell").map((row) => row.id)).toEqual([
      "curl-db",
    ]);
    expect(matchExercises(catalog, "ez").map((row) => row.id)).toEqual(["curl-bb"]);
    expect(matchExercises(catalog, "bodyweight").map((row) => row.id)).toEqual([
      "pullup",
    ]);
  });

  it("requires every whitespace token on a multi-word query", () => {
    expect(matchExercises(catalog, "curl barbell").map((row) => row.id)).toEqual([
      "curl-bb",
    ]);
    expect(matchExercises(catalog, "curl missing")).toEqual([]);
  });

  it("returns nothing when no row matches", () => {
    expect(matchExercises(catalog, "snatch")).toEqual([]);
  });
});

describe("resolveExerciseQuery", () => {
  it("selects an exact label, including equipment", () => {
    expect(resolveExerciseQuery(catalog, "curl · dumbbell l/r")?.id).toBe("curl-db");
  });

  it("selects a unique exact name and leaves two Curls unresolved", () => {
    expect(resolveExerciseQuery(catalog, "Romanian Deadlift")?.id).toBe("rdl");
    expect(resolveExerciseQuery(catalog, "curl")).toBeNull();
  });

  it("selects the only remaining match for a unique substring", () => {
    expect(resolveExerciseQuery(catalog, "incline")?.id).toBe("incline");
  });

  it("does not invent a row from a typo or a blank", () => {
    expect(resolveExerciseQuery(catalog, "snatch")).toBeNull();
    expect(resolveExerciseQuery(catalog, "   ")).toBeNull();
  });
});
