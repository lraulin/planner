import { describe, expect, it } from "vitest";
import { dueLabel, reminderOpenHref, viewTasksHref } from "./targets";

const NOW = new Date("2026-10-29T16:00:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("dueLabel", () => {
  it("reads past and future, in the unit that fits", () => {
    expect(dueLabel("task", at(-12), NOW)).toBe("due 12 min ago");
    expect(dueLabel("task", at(90), NOW)).toBe("due in 2 h");
    expect(dueLabel("bill", at(-36 * 60), NOW)).toBe("due 2 days ago");
  });

  it("speaks of an appointment's start", () => {
    expect(dueLabel("appointment", at(5), NOW)).toBe("starts in 5 min");
    expect(dueLabel("appointment", at(-3), NOW)).toBe("started 3 min ago");
  });
});

describe("reminder destinations", () => {
  const base = { dueAt: NOW, dayKey: "2026-10-29" };

  it("opens a task in the outline with its drawer, and an appointment on its day", () => {
    expect(reminderOpenHref({ ...base, sourceKind: "task", sourceId: "n1" })).toBe(
      "/plan/outline?select=n1&detail=n1",
    );
    const appointment = reminderOpenHref({
      ...base,
      sourceKind: "appointment",
      sourceId: "a1",
    });
    expect(appointment).toContain("/schedule/calendar?");
    expect(appointment).toContain("start=2026-10-29");
    expect(appointment).toContain("detail=a1");
  });

  it("narrows Tasks to the block's project", () => {
    expect(viewTasksHref("p1")).toBe("/plan/tasks?scope=p1");
  });
});
