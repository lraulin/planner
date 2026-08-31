import { describe, expect, it } from "vitest";
import {
  currentSetCue,
  currentSetTarget,
  restAfterComplete,
  sessionIsIncomplete,
  sessionSetProgress,
} from "./currentSet";
import {
  emptyBilateralSet,
  type DraftExercise,
  type DraftGroup,
  type DraftSet,
} from "./sessionDraft";

function set(over: Partial<DraftSet> = {}): DraftSet {
  return { ...emptyBilateralSet("lb"), reps: "5", weight: "100", ...over };
}

function block(over: Partial<DraftExercise> & { sets: DraftSet[] }): DraftExercise {
  return {
    key: over.key ?? over.exerciseName ?? "b",
    groupId: over.groupId ?? null,
    exerciseId: over.exerciseId ?? "ex",
    exerciseName: over.exerciseName ?? "Bench",
    equipment: "barbell",
    measure: "reps",
    barWeight: 45,
    unilateral: false,
    notes: "",
    ...over,
  };
}

const groups: DraftGroup[] = [{ id: "g1", label: "Superset", rest: "90" }];

describe("currentSetTarget", () => {
  it("picks the first incomplete set of a straight session", () => {
    const exercises = [
      block({
        exerciseName: "Bench",
        sets: [set({ completed: true }), set({ completed: false }), set()],
      }),
    ];
    expect(currentSetTarget(exercises, [])).toEqual({ blockIndex: 0, setIndex: 1 });
  });

  it("walks past a finished exercise onto the next one", () => {
    const exercises = [
      block({
        exerciseName: "Bench",
        sets: [set({ completed: true })],
      }),
      block({
        key: "ohp",
        exerciseName: "OHP",
        sets: [set({ completed: false })],
      }),
    ];
    expect(currentSetTarget(exercises, [])).toEqual({ blockIndex: 1, setIndex: 0 });
  });

  it("is round-major inside a group: A1 r1, then A2 r1, then A1 r2", () => {
    const exercises = [
      block({
        key: "press",
        exerciseName: "Press",
        groupId: "g1",
        sets: [set({ completed: true }), set({ completed: false })],
      }),
      block({
        key: "row",
        exerciseName: "Row",
        groupId: "g1",
        sets: [set({ completed: false }), set({ completed: false })],
      }),
    ];
    expect(currentSetTarget(exercises, groups)).toEqual({
      blockIndex: 1,
      setIndex: 0,
    });
  });

  it("returns null when every set is done — reviewing history, not lifting", () => {
    const exercises = [
      block({ sets: [set({ completed: true }), set({ completed: true })] }),
    ];
    expect(currentSetTarget(exercises, [])).toBeNull();
    expect(sessionIsIncomplete(exercises)).toBe(false);
  });

  it("lands on set 1 when nothing is checked yet", () => {
    const exercises = [
      block({ sets: [set({ completed: false }), set({ completed: false })] }),
      block({
        key: "row",
        exerciseName: "Row",
        sets: [set({ completed: false })],
      }),
    ];
    expect(currentSetTarget(exercises, [])).toEqual({ blockIndex: 0, setIndex: 0 });
    expect(sessionSetProgress(exercises)).toEqual({ done: 0, total: 3 });
  });

  it("skips a trailing shortfall rather than inventing a set", () => {
    // Row stopped after round 1; round 2 is Press only.
    const exercises = [
      block({
        key: "press",
        exerciseName: "Press",
        groupId: "g1",
        sets: [set({ completed: true }), set({ completed: false })],
      }),
      block({
        key: "row",
        exerciseName: "Row",
        groupId: "g1",
        sets: [set({ completed: true })],
      }),
    ];
    expect(currentSetTarget(exercises, groups)).toEqual({
      blockIndex: 0,
      setIndex: 1,
    });
  });
});

describe("restAfterComplete", () => {
  it("starts rest for the next straight set, but not after the session's last", () => {
    const mid = [
      block({
        sets: [set({ completed: true }), set({ completed: false })],
      }),
    ];
    expect(restAfterComplete(mid, [], { blockIndex: 0, setIndex: 0 })).toEqual({
      exerciseName: "Bench",
      setNumber: 2,
    });

    const last = [block({ sets: [set({ completed: true })] })];
    expect(restAfterComplete(last, [], { blockIndex: 0, setIndex: 0 })).toBeNull();
  });

  it("does not rest after a group member that is not the end of the round", () => {
    const afterA1 = [
      block({
        key: "press",
        exerciseName: "Press",
        groupId: "g1",
        sets: [set({ completed: true }), set({ completed: false })],
      }),
      block({
        key: "row",
        exerciseName: "Row",
        groupId: "g1",
        sets: [set({ completed: false }), set({ completed: false })],
      }),
    ];
    expect(
      restAfterComplete(afterA1, groups, { blockIndex: 0, setIndex: 0 }),
    ).toBeNull();
  });

  it("rests after the last member of a round, for the next round's first lift", () => {
    const afterRound = [
      block({
        key: "press",
        exerciseName: "Press",
        groupId: "g1",
        sets: [set({ completed: true }), set({ completed: false })],
      }),
      block({
        key: "row",
        exerciseName: "Row",
        groupId: "g1",
        sets: [set({ completed: true }), set({ completed: false })],
      }),
    ];
    expect(
      restAfterComplete(afterRound, groups, { blockIndex: 1, setIndex: 0 }),
    ).toEqual({ exerciseName: "Press", setNumber: 2 });
  });
});

describe("currentSetCue", () => {
  it("names the lift and the 1-based set of that lift", () => {
    const exercises = [
      block({
        exerciseName: "OHP",
        sets: [set({ completed: true }), set({ completed: false }), set()],
      }),
    ];
    expect(currentSetCue(exercises, [])).toEqual({
      exerciseName: "OHP",
      setNumber: 2,
      setCount: 3,
      target: { blockIndex: 0, setIndex: 1 },
    });
  });
});
