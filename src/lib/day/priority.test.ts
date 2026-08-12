import { describe, expect, it } from "vitest";
import { isDayItemSettled, sortDayItems } from "./priority";

type Row = {
  id: string;
  priorityLetter: "A" | "B" | "C" | "D" | null;
  priorityRank: number | null;
  sortKey: string;
  state?: string;
  completedAt?: Date | null;
};

function row(id: string, over: Partial<Row> & { sortKey: string }): Row {
  return {
    id,
    priorityLetter: null,
    priorityRank: null,
    completedAt: null,
    state: "not_started",
    ...over,
  };
}

describe("isDayItemSettled", () => {
  it("treats completedAt as settled even when state has reset", () => {
    expect(isDayItemSettled({ state: "not_started", completedAt: new Date() })).toBe(
      true,
    );
  });

  it("treats cancelled as settled without relying on completedAt alone", () => {
    expect(isDayItemSettled({ state: "cancelled", completedAt: null })).toBe(true);
  });

  it("treats completed state as settled even if completedAt was never stamped", () => {
    // The day grid and week planner used to only check completedAt and cancelled, so a
    // completed line missing the stamp would keep its full-weight typography.
    expect(isDayItemSettled({ state: "completed", completedAt: null })).toBe(true);
  });

  it("leaves open work unsettled", () => {
    expect(isDayItemSettled({ state: "in_progress", completedAt: null })).toBe(false);
  });
});

describe("sortDayItems", () => {
  it("puts completed and cancelled lines after open work", () => {
    const open = row("open", { sortKey: "a", priorityLetter: "A", priorityRank: 1 });
    const done = row("done", {
      sortKey: "b",
      priorityLetter: "A",
      priorityRank: 2,
      completedAt: new Date(),
      state: "completed",
    });
    const killed = row("killed", {
      sortKey: "c",
      priorityLetter: null,
      completedAt: new Date(),
      state: "cancelled",
    });
    const late = row("late", { sortKey: "d", priorityLetter: "B", priorityRank: 1 });

    expect(sortDayItems([done, late, killed, open]).map((r) => r.id)).toEqual([
      "open",
      "late",
      "done",
      "killed",
    ]);
  });

  it("keeps priority order among open items", () => {
    const b = row("b", { sortKey: "1", priorityLetter: "B", priorityRank: 1 });
    const a = row("a", { sortKey: "2", priorityLetter: "A", priorityRank: 1 });
    expect(sortDayItems([b, a]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
