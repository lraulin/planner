import { describe, expect, it } from "vitest";
import {
  fitnessExerciseEditPath,
  fitnessExerciseNewPath,
  fitnessExercisesPath,
  fitnessLogPath,
  fitnessSessionPath,
  fitnessSessionsPath,
} from "./routes";

describe("fitness routes", () => {
  it("builds stable paths", () => {
    expect(fitnessSessionsPath()).toBe("/fitness");
    expect(fitnessExercisesPath()).toBe("/fitness/exercises");
    expect(fitnessLogPath()).toBe("/fitness/log");
    expect(fitnessLogPath("ex-1")).toBe("/fitness/log?exercise=ex-1");
    expect(fitnessSessionPath("s1")).toBe("/fitness/sessions/s1");
    expect(fitnessExerciseNewPath()).toBe("/fitness/exercises/new");
    expect(fitnessExerciseEditPath("e1")).toBe("/fitness/exercises/e1");
  });
});
