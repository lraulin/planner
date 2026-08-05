import { describe, expect, it } from "vitest";
import { fromDateKey, shiftDateKey } from "@/lib/schedule/geometry";
import {
  scheduleStatus,
  scheduleStatusById,
  scheduleStatusForNode,
  STATUS_LABELS,
  type ScheduleStatus,
} from "./status";
import type { Shelf } from "./shelving";
import { derive } from "./derive";
import { row } from "./fixtures";

const TODAY = "2026-07-28";

/** Calendar day `days` from TODAY — UTC-noon encoding. */
function day(days: number): Date {
  return fromDateKey(shiftDateKey(TODAY, days));
}

function status(partial: {
  deadline?: Date | null;
  targetStart?: Date | null;
  targetEnd?: Date | null;
  state?:
    "not_started" | "in_progress" | "waiting" | "completed" | "cancelled" | "postponed";
  shelf?: Shelf | null;
  priorityLetter?: "A" | "B" | "C" | "D" | null;
  today?: string | null;
}): ScheduleStatus {
  return scheduleStatus({
    deadline: partial.deadline ?? null,
    targetStart: partial.targetStart ?? null,
    targetEnd: partial.targetEnd ?? null,
    state: partial.state ?? "not_started",
    shelf: partial.shelf ?? null,
    priorityLetter: partial.priorityLetter ?? null,
    today: partial.today === undefined ? TODAY : partial.today,
  });
}

function shelf(days: number | null): Shelf {
  return { until: days === null ? null : day(days), sourceId: "n1" };
}

describe("scheduleStatus — deadline bands", () => {
  it("bands a deadline by how far out it is", () => {
    expect(status({ deadline: day(-1) })).toBe("overdue");
    expect(status({ deadline: day(0) })).toBe("due_today");
    expect(status({ deadline: day(1) })).toBe("due_tomorrow");
    expect(status({ deadline: day(2) })).toBe("close_to_deadline");
    expect(status({ deadline: day(3) })).toBe("due_soon");
    expect(status({ deadline: day(5) })).toBe("due_soon");
    expect(status({ deadline: day(6) })).toBe("on_schedule");
  });

  it("reports finished work as completed, however overdue", () => {
    expect(status({ deadline: day(-10), state: "completed" })).toBe("completed");
    expect(status({ deadline: day(-10), state: "cancelled" })).toBe("completed");
  });
});

describe("scheduleStatus — Behind Schedule", () => {
  it("flags NS work whose target start is already past", () => {
    expect(status({ targetStart: day(-2) })).toBe("behind_schedule");
  });

  it("flags started work whose target end is past", () => {
    expect(status({ state: "in_progress", targetEnd: day(-1) })).toBe(
      "behind_schedule",
    );
  });

  it("flags when target end is after the deadline", () => {
    expect(status({ deadline: day(3), targetEnd: day(5) })).toBe("behind_schedule");
  });

  it("lets overdue beat behind schedule when the deadline is past", () => {
    expect(status({ deadline: day(-1), targetStart: day(-5) })).toBe("overdue");
  });
});

describe("scheduleStatus — Need to Start, Ongoing, Waiting, Not Scheduled", () => {
  it("Need to Start is NS with target start today", () => {
    expect(status({ targetStart: day(0) })).toBe("need_to_start");
  });

  it("Waiting state surfaces when nothing more urgent applies", () => {
    expect(status({ state: "waiting" })).toBe("waiting");
  });

  it("Ongoing is started work with no near end date", () => {
    expect(status({ state: "in_progress" })).toBe("ongoing");
    expect(status({ state: "in_progress", targetEnd: day(10) })).toBe("ongoing");
  });

  it("Not Scheduled for undated NS work and for D priority", () => {
    expect(status({})).toBe("not_scheduled");
    expect(status({ priorityLetter: "D", targetStart: day(3) })).toBe("not_scheduled");
  });
});

describe("scheduleStatus — No Slack", () => {
  it("fires when target end is within a day of the deadline", () => {
    // Deadline in 10 days, end in 10 days → no slack; not close-to-deadline (that's on due).
    expect(status({ deadline: day(10), targetEnd: day(10) })).toBe("no_slack");
    expect(status({ deadline: day(10), targetEnd: day(9) })).toBe("no_slack");
  });
});

describe("scheduleStatus — shelf / deferred", () => {
  it("reports a task waiting on its deferred date as deferred", () => {
    expect(status({ shelf: shelf(3) })).toBe("deferred");
  });

  it("stops being deferred once the date arrives", () => {
    expect(status({ shelf: shelf(0) })).toBe("not_scheduled");
    expect(status({ shelf: shelf(-30) })).toBe("not_scheduled");
  });

  it("lets finished work outrank a pending deferral", () => {
    expect(status({ state: "completed", shelf: shelf(3) })).toBe("completed");
  });

  it("prefers deferred over a deadline band while shelved", () => {
    expect(status({ deadline: day(-1), shelf: shelf(3) })).toBe("deferred");
  });

  /**
   * The stored state outliving its shelf is normal — expiry is derived, never swept — so
   * every band below the deferred check has to read the *effective* state too. Reading the
   * raw one made a routine that came back this morning look like work already underway.
   */
  it("reads a routine back off the shelf as not started, not as underway", () => {
    // Tick off "empty cat litter": postponed, deferred and planned for tomorrow. Tomorrow.
    expect(status({ state: "postponed", shelf: shelf(0), targetStart: day(0) })).toBe(
      "need_to_start",
    );
  });

  it("puts a routine whose planned day has passed behind schedule", () => {
    expect(status({ state: "postponed", shelf: shelf(-1), targetStart: day(-3) })).toBe(
      "behind_schedule",
    );
  });

  it("leaves an expired shelf with no plan unscheduled rather than ongoing", () => {
    expect(status({ state: "postponed", shelf: shelf(-1) })).toBe("not_scheduled");
  });
});

describe("scheduleStatus — hydration", () => {
  it("reports on schedule before hydration, when today is unknown", () => {
    expect(status({ deadline: day(-10), today: null })).toBe("on_schedule");
  });
});

describe("scheduleStatusById — propagation", () => {
  it("rolls overdue from child to parent", () => {
    const nodes = derive([
      row({ id: "p", type: "project", name: "P", sortKey: "a" }),
      row({
        id: "t",
        type: "task",
        parentId: "p",
        name: "T",
        sortKey: "a",
        deadline: day(-1),
      }),
    ]);
    const map = scheduleStatusById(nodes, TODAY);
    expect(map.get("t")).toBe("overdue");
    expect(map.get("p")).toBe("overdue");
  });

  it("does not let completed children paint the parent overdue", () => {
    const nodes = derive([
      row({ id: "p", type: "project", name: "P", sortKey: "a" }),
      row({
        id: "t",
        type: "task",
        parentId: "p",
        name: "T",
        sortKey: "a",
        state: "completed",
        deadline: day(-1),
      }),
    ]);
    const map = scheduleStatusById(nodes, TODAY);
    expect(map.get("t")).toBe("completed");
    // Parent has no dates of its own and no propagating child status.
    expect(map.get("p")).toBe("not_scheduled");
  });
});

describe("scheduleStatusForNode", () => {
  it("reads dates off the outline node", () => {
    const [node] = derive([row({ id: "t", type: "task", targetStart: day(-1) })]);
    expect(scheduleStatusForNode(node, TODAY)).toBe("behind_schedule");
  });
});

describe("STATUS_LABELS", () => {
  it("labels every status", () => {
    const statuses: ScheduleStatus[] = [
      "completed",
      "overdue",
      "due_today",
      "due_tomorrow",
      "behind_schedule",
      "close_to_deadline",
      "no_slack",
      "due_soon",
      "deferred",
      "need_to_start",
      "waiting",
      "ongoing",
      "not_scheduled",
      "on_schedule",
    ];
    for (const s of statuses) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });
});
