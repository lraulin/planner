import { describe, expect, it } from "vitest";
import { addRound, extendMemberTo, removeRound, roundRows } from "./rounds";
import { emptyDraftBlock, type DraftExercise, type DraftSet } from "./sessionDraft";

function set(reps: string, weight = "100"): DraftSet {
  return { reps, repsLeft: "", repsRight: "", duration: "", weight, unit: "lb" };
}

function member(name: string, reps: string[]): DraftExercise {
  return {
    ...emptyDraftBlock(),
    exerciseName: name,
    groupId: "g1",
    sets: reps.map((r) => set(r)),
  };
}

function repsOf(members: DraftExercise[]): string[][] {
  return members.map((m) => m.sets.map((s) => s.reps));
}

describe("roundRows", () => {
  it("returns one row per member, in group order", () => {
    const members = [member("Press", ["10", "10"]), member("Row", ["12", "12"])];
    expect(roundRows(members, 0).map((r) => r.set?.reps)).toEqual(["10", "12"]);
  });

  it("gives a member that stopped early a null set rather than dropping its row", () => {
    const members = [member("Press", ["10", "10", "8"]), member("Row", ["12", "12"])];
    const rows = roundRows(members, 2);
    expect(rows.map((r) => r.set?.reps ?? null)).toEqual(["8", null]);
    expect(rows.map((r) => r.memberIndex)).toEqual([0, 1]);
  });
});

describe("addRound", () => {
  it("copies each member's last set, the way a straight Add set does", () => {
    const members = [member("Press", ["10"]), member("Row", ["12"])];
    expect(repsOf(addRound(members))).toEqual([
      ["10", "10"],
      ["12", "12"],
    ]);
  });

  it("levels a member that stopped early, so no member gains a hole", () => {
    // Press did 3 rounds, Row stopped after 1. Adding round 4 must leave Row with 4 sets.
    const members = [member("Press", ["10", "10", "8"]), member("Row", ["12"])];
    expect(repsOf(addRound(members))).toEqual([
      ["10", "10", "8", "8"],
      ["12", "", "", "12"],
    ]);
  });

  it("fills the skipped rounds blank rather than repeating the last effort", () => {
    const members = [member("Press", ["10", "10"]), member("Row", ["12"])];
    const [, row] = addRound(members);
    expect(row.sets.map((s) => s.reps)).toEqual(["12", "", "12"]);
  });

  it("starts an empty group at one set each", () => {
    const members = [
      { ...emptyDraftBlock(), groupId: "g1", sets: [] },
      { ...emptyDraftBlock(), groupId: "g1", sets: [] },
    ];
    expect(addRound(members).map((m) => m.sets.length)).toEqual([1, 1]);
  });
});

describe("removeRound", () => {
  it("drops the same round from every member, keeping the rest aligned", () => {
    const members = [
      member("Press", ["10", "9", "8"]),
      member("Row", ["12", "11", "10"]),
    ];
    expect(repsOf(removeRound(members, 1))).toEqual([
      ["10", "8"],
      ["12", "10"],
    ]);
  });

  it("leaves a member alone when it never reached that round", () => {
    const members = [member("Press", ["10", "9", "8"]), member("Row", ["12"])];
    expect(repsOf(removeRound(members, 2))).toEqual([["10", "9"], ["12"]]);
  });

  it("never empties a member — the editor always needs a row to type into", () => {
    const members = [member("Press", ["10"]), member("Row", ["12"])];
    expect(repsOf(removeRound(members, 0))).toEqual([[""], [""]]);
  });
});

describe("extendMemberTo", () => {
  it("gives one member a row for a round it had stopped before", () => {
    const members = [member("Press", ["10", "9", "8"]), member("Row", ["12"])];
    expect(repsOf(extendMemberTo(members, 1, 2))).toEqual([
      ["10", "9", "8"],
      ["12", "", ""],
    ]);
  });

  it("leaves a member that already has that round untouched", () => {
    const members = [member("Press", ["10", "9"]), member("Row", ["12", "11"])];
    expect(repsOf(extendMemberTo(members, 1, 1))).toEqual([
      ["10", "9"],
      ["12", "11"],
    ]);
  });

  it("touches only the named member", () => {
    const members = [member("Press", ["10"]), member("Row", ["12"])];
    expect(repsOf(extendMemberTo(members, 1, 2))).toEqual([["10"], ["12", "", ""]]);
  });
});
