import { describe, expect, it } from "vitest";
import { scheduleStatus, STATUS_LABELS, type ScheduleStatus } from "./status";
import type { Shelf } from "./shelving";
import { nodeStateEnum, type NodeState } from "@/db/schema";

const TODAY = "2026-07-28";

/** A deadline `days` out from TODAY, as the database would hand it back. */
function deadline(days: number): Date {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 24 * 60 * 60 * 1000);
}

function statusIn(days: number, state: NodeState = "not_started"): ScheduleStatus {
  return scheduleStatus(deadline(days), TODAY, state);
}

/** A shelf expiring `days` out from TODAY. `null` days is an indefinite one. */
function shelf(days: number | null): Shelf {
  return { until: days === null ? null : deadline(days), sourceId: "n1" };
}

describe("scheduleStatus", () => {
  it("bands a deadline by how far out it is", () => {
    expect(statusIn(-30)).toBe("overdue");
    expect(statusIn(-1)).toBe("overdue");
    expect(statusIn(0)).toBe("due_today");
    expect(statusIn(1)).toBe("due_tomorrow");
    expect(statusIn(2)).toBe("close_to_deadline");
    expect(statusIn(3)).toBe("due_soon");
    expect(statusIn(5)).toBe("due_soon");
    expect(statusIn(6)).toBe("on_schedule");
    expect(statusIn(365)).toBe("on_schedule");
  });

  it("puts each boundary on the more urgent side", () => {
    // The bands are inclusive at their far edge: 2 days is still Close to Deadline, and
    // 5 days is still Due Soon. One day further is the next band out.
    expect(statusIn(2)).toBe("close_to_deadline");
    expect(statusIn(3)).not.toBe("close_to_deadline");
    expect(statusIn(5)).toBe("due_soon");
    expect(statusIn(6)).not.toBe("due_soon");
  });

  it("treats a deadline as a calendar day, not an instant", () => {
    // Late in the day on the deadline is Due Today, not Overdue.
    const lateToday = new Date(`${TODAY}T23:30:00Z`);
    expect(scheduleStatus(lateToday, TODAY, "not_started")).toBe("due_today");
  });

  it("reports no deadline as on schedule", () => {
    expect(scheduleStatus(null, TODAY, "not_started")).toBe("on_schedule");
  });

  it("reports on schedule before hydration, when today is unknown", () => {
    expect(scheduleStatus(deadline(-10), null, "not_started")).toBe("on_schedule");
  });

  it("reports finished work as completed, however overdue", () => {
    expect(statusIn(-10, "completed")).toBe("completed");
    expect(statusIn(-10, "cancelled")).toBe("completed");
    expect(scheduleStatus(null, TODAY, "completed")).toBe("completed");
  });

  it("bands unfinished work by deadline whatever its state", () => {
    for (const state of nodeStateEnum.enumValues) {
      if (state === "completed" || state === "cancelled") continue;
      expect(statusIn(-1, state)).toBe("overdue");
    }
  });

  it("reports a task waiting on its deferred date as deferred", () => {
    expect(scheduleStatus(null, TODAY, "not_started", shelf(3))).toBe("deferred");
  });

  it("stops being deferred once the date arrives, and never escalates", () => {
    // A repeating routine has no deadline by design, so once it comes back it is simply
    // on schedule. It can never age into Overdue — that is the point of the whole model.
    expect(scheduleStatus(null, TODAY, "not_started", shelf(0))).toBe("on_schedule");
    expect(scheduleStatus(null, TODAY, "not_started", shelf(-30))).toBe("on_schedule");
  });

  it("lets finished work outrank a pending deferral", () => {
    expect(scheduleStatus(null, TODAY, "completed", shelf(3))).toBe("completed");
  });

  it("prefers deferred over a deadline band, since it is not available to work on", () => {
    expect(scheduleStatus(deadline(-1), TODAY, "not_started", shelf(3))).toBe(
      "deferred",
    );
  });
});

describe("STATUS_LABELS", () => {
  it("labels every status", () => {
    const statuses: ScheduleStatus[] = [
      "completed",
      "deferred",
      "overdue",
      "due_today",
      "due_tomorrow",
      "close_to_deadline",
      "due_soon",
      "on_schedule",
    ];
    for (const status of statuses) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });
});
