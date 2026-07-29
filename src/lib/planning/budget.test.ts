import { describe, expect, it } from "vitest";
import {
  commitmentPercent,
  summarizeBudget,
  suggestCommitment,
  type CommitmentRow,
} from "./budget";

function row(committedMinutes: number | null, effortLeftMinutes = 600): CommitmentRow {
  return { nodeId: crypto.randomUUID(), effortLeftMinutes, committedMinutes };
}

describe("summarizeBudget", () => {
  it("subtracts committed time from the week's budget", () => {
    const s = summarizeBudget([row(120), row(180)], 40 * 60);
    expect(s.committedMinutes).toBe(300);
    expect(s.remainingMinutes).toBe(2100);
    expect(s.overCommitted).toBe(false);
  });

  it("treats an undecided row as undecided, not as zero committed", () => {
    // The distinction drives the UI: a null renders an empty cell and does not count
    // toward committedCount, so "3 of 8 projects committed" stays honest.
    const s = summarizeBudget([row(null), row(60)], 600);
    expect(s.committedMinutes).toBe(60);
    expect(s.committedCount).toBe(1);
  });

  it("reports over-commitment with a negative remainder", () => {
    const s = summarizeBudget([row(30 * 60), row(20 * 60)], 40 * 60);
    expect(s.overCommitted).toBe(true);
    expect(s.remainingMinutes).toBe(-10 * 60);
    expect(s.percentCommitted).toBe(125);
  });

  it("leaves the remainder unknown when no budget has been set", () => {
    const s = summarizeBudget([row(120)], null);
    expect(s.remainingMinutes).toBeNull();
    expect(s.percentCommitted).toBeNull();
    expect(s.overCommitted).toBe(false);
  });

  it("ignores a negative commitment rather than crediting time back", () => {
    const s = summarizeBudget([row(-60), row(60)], 600);
    expect(s.committedMinutes).toBe(60);
  });
});

describe("commitmentPercent", () => {
  it("is null when there is nothing to divide by", () => {
    expect(commitmentPercent(60, 0)).toBeNull();
    expect(commitmentPercent(60, null)).toBeNull();
  });

  it("is null for an undecided row but zero for a deliberate zero", () => {
    expect(commitmentPercent(null, 600)).toBeNull();
    expect(commitmentPercent(0, 600)).toBe(0);
  });
});

describe("suggestCommitment", () => {
  it("offers the outstanding effort when it fits inside half the week", () => {
    expect(suggestCommitment(180, 40 * 60)).toBe(180);
  });

  it("caps a project that would swallow the week at half the budget", () => {
    expect(suggestCommitment(60 * 60, 40 * 60)).toBe(20 * 60);
  });

  it("snaps to a quarter hour, matching the calendar", () => {
    expect(suggestCommitment(100, 40 * 60)).toBe(105);
  });

  it("offers nothing for an unestimated project", () => {
    expect(suggestCommitment(null, 40 * 60)).toBe(0);
    expect(suggestCommitment(0, 40 * 60)).toBe(0);
  });
});
