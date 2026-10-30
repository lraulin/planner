import { describe, expect, it } from "vitest";
import { fromDateKey } from "@/lib/schedule/geometry";
import { zonedWallTime } from "@/lib/schedule/zonedTime";
import { DEFAULT_NOTIFICATION_PREFS as PREFS } from "@/lib/settings/notifications";
import {
  appointmentOccurrences,
  armWindow,
  autoReminderFor,
  billOccurrences,
  isStillDue,
  nodeOccurrences,
  pointWindow,
  reminderAfterDeadlineChange,
  snoozeTarget,
  type AppointmentReminderSource,
  type NodeReminderSource,
} from "./derive";

const NY = "America/New_York";
const NOW = new Date("2026-10-29T16:00:00.000Z"); // Thu 12:00 EDT
const WINDOW = armWindow(NOW);

function task(overrides: Partial<NodeReminderSource> = {}): NodeReminderSource {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "task",
    name: "File taxes",
    state: "not_started",
    deadline: null,
    reminderAt: new Date("2026-10-29T18:00:00.000Z"),
    ...overrides,
  };
}

function appointment(
  overrides: Partial<AppointmentReminderSource> = {},
): AppointmentReminderSource {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    subject: "Write chapter",
    location: "",
    startAt: new Date("2026-10-29T18:00:00.000Z"),
    endAt: new Date("2026-10-29T19:00:00.000Z"),
    allDay: false,
    checkState: "open",
    projectId: null,
    reminderMinutes: null,
    recurrenceFrequency: "none",
    recurrenceInterval: 1,
    recurrenceByWeekday: null,
    recurrenceEnd: "never",
    recurrenceCount: null,
    recurrenceUntil: null,
    externalSeriesId: null,
    ...overrides,
  };
}

describe("nodeOccurrences", () => {
  it("arms a reminder inside the horizon and keys it by its time", () => {
    const [occ] = nodeOccurrences(task(), PREFS, WINDOW);
    expect(occ.occurrenceKey).toBe("2026-10-29T18:00:00.000Z");
    expect(occ.scheduledFor.toISOString()).toBe("2026-10-29T18:00:00.000Z");
  });

  it("arms nothing for settled work, but does for a shelved repeating task", () => {
    expect(nodeOccurrences(task({ state: "completed" }), PREFS, WINDOW)).toEqual([]);
    expect(nodeOccurrences(task({ state: "cancelled" }), PREFS, WINDOW)).toEqual([]);
    // Completing a repeating task shelves it as postponed until next time — and its next
    // reminder is the whole reason the reminder moved with it.
    expect(nodeOccurrences(task({ state: "postponed" }), PREFS, WINDOW)).toHaveLength(
      1,
    );
  });

  it("leaves a reminder beyond seven days for the daily sweep", () => {
    const far = task({ reminderAt: new Date("2026-11-06T18:00:00.000Z") });
    expect(nodeOccurrences(far, PREFS, WINDOW)).toEqual([]);
  });

  it("respects the per-kind switch", () => {
    expect(nodeOccurrences(task(), { ...PREFS, tasks: false }, WINDOW)).toEqual([]);
  });
});

describe("appointmentOccurrences", () => {
  it("fires an explicit reminder before the start", () => {
    const [occ] = appointmentOccurrences(
      appointment({ reminderMinutes: 15 }),
      PREFS,
      WINDOW,
      NY,
    );
    expect(occ.scheduledFor.toISOString()).toBe("2026-10-29T17:45:00.000Z");
    expect(occ.dueAt.toISOString()).toBe("2026-10-29T18:00:00.000Z");
  });

  it("alerts a project block at the configured lead, and a plain event not at all", () => {
    const block = appointment({ projectId: "00000000-0000-4000-8000-0000000000aa" });
    const [occ] = appointmentOccurrences(
      block,
      { ...PREFS, projectBlockLeadMinutes: 5 },
      WINDOW,
      NY,
    );
    expect(occ.scheduledFor.toISOString()).toBe("2026-10-29T17:55:00.000Z");
    expect(occ.detail).toMatch(/^Project block/);
    expect(
      appointmentOccurrences(
        block,
        { ...PREFS, projectBlockLeadMinutes: null },
        WINDOW,
        NY,
      ),
    ).toEqual([]);
    expect(appointmentOccurrences(appointment(), PREFS, WINDOW, NY)).toEqual([]);
  });

  it("puts the fire time in the key, so a new lead is a new occurrence", () => {
    const [a] = appointmentOccurrences(
      appointment({ reminderMinutes: 10 }),
      PREFS,
      WINDOW,
      NY,
    );
    const [b] = appointmentOccurrences(
      appointment({ reminderMinutes: 15 }),
      PREFS,
      WINDOW,
      NY,
    );
    expect(a.occurrenceKey).not.toBe(b.occurrenceKey);
  });

  it("expands a local repeating master inside the window only", () => {
    const daily = appointment({
      reminderMinutes: 0,
      startAt: new Date("2026-10-01T18:00:00.000Z"),
      endAt: new Date("2026-10-01T19:00:00.000Z"),
      recurrenceFrequency: "daily",
    });
    const occs = appointmentOccurrences(daily, PREFS, WINDOW, NY);
    // Thu 29th through Wed 4th: seven starts. The 5th at 14:00 EST is past the horizon.
    expect(occs).toHaveLength(7);
    expect(new Set(occs.map((o) => o.occurrenceKey)).size).toBe(7);
  });

  it("skips an occurrence already checked off", () => {
    expect(
      appointmentOccurrences(
        appointment({ reminderMinutes: 5, checkState: "done" }),
        PREFS,
        WINDOW,
        NY,
      ),
    ).toEqual([]);
  });
});

describe("billOccurrences", () => {
  const bill = {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Rent",
    active: true,
    expectedKey: "2026-10-31",
    expectedCents: 150000,
  };

  it("alerts at the morning time on the expected day, in the reader's zone", () => {
    const [occ] = billOccurrences(bill, PREFS, WINDOW, NY);
    expect(occ.scheduledFor.toISOString()).toBe("2026-10-31T13:00:00.000Z");
    expect(occ.detail).toContain("$1,500.00");
  });

  it("arms nothing for a paused bill or one with no expected date", () => {
    expect(billOccurrences({ ...bill, active: false }, PREFS, WINDOW, NY)).toEqual([]);
    expect(billOccurrences({ ...bill, expectedKey: null }, PREFS, WINDOW, NY)).toEqual(
      [],
    );
  });
});

describe("isStillDue", () => {
  const armed = { ...nodeOccurrences(task(), PREFS, WINDOW)[0] };
  const check = (source: NodeReminderSource) =>
    isStillDue(armed, nodeOccurrences(source, PREFS, pointWindow(armed.scheduledFor)));

  it("holds while the source is unchanged, even long after the horizon has moved on", () => {
    expect(check(task())).toBe(true);
  });

  it("fails once the reminder moves, the task settles, or the task is gone", () => {
    expect(check(task({ reminderAt: new Date("2026-10-29T19:00:00.000Z") }))).toBe(
      false,
    );
    expect(check(task({ state: "completed" }))).toBe(false);
    expect(isStillDue(armed, [])).toBe(false);
  });

  it("goes stale for a bill once a charge moves its expected date on", () => {
    const bill = {
      id: "00000000-0000-4000-8000-000000000003",
      name: "Rent",
      active: true,
      expectedKey: "2026-10-31",
      expectedCents: null,
    };
    const [occ] = billOccurrences(bill, PREFS, WINDOW, NY);
    const paid = { ...bill, expectedKey: "2026-11-30" };
    expect(
      isStillDue(occ, billOccurrences(paid, PREFS, pointWindow(occ.scheduledFor), NY)),
    ).toBe(false);
  });
});

describe("auto-set reminder from a deadline", () => {
  it("is N days before the deadline day at the configured time", () => {
    expect(autoReminderFor(fromDateKey("2026-11-05"), PREFS, NY).toISOString()).toBe(
      "2026-11-04T14:00:00.000Z",
    );
  });

  // The deadline is a calendar day stored as UTC noon; the reminder is an instant in the
  // reader's zone. Across the fall-back weekend, 09:00 must stay 09:00.
  it("survives the daylight-saving change between deadline and reminder", () => {
    expect(autoReminderFor(fromDateKey("2026-11-02"), PREFS, NY).toISOString()).toBe(
      "2026-11-01T14:00:00.000Z",
    );
    expect(autoReminderFor(fromDateKey("2026-11-01"), PREFS, NY).toISOString()).toBe(
      "2026-10-31T13:00:00.000Z",
    );
  });

  it("sets a reminder where there was none", () => {
    const next = reminderAfterDeadlineChange(
      {
        previousDeadline: null,
        nextDeadline: fromDateKey("2026-11-05"),
        reminderAt: null,
      },
      PREFS,
      NY,
    );
    expect(next?.toISOString()).toBe("2026-11-04T14:00:00.000Z");
  });

  it("moves an auto-valued reminder with the deadline and clears it with the deadline", () => {
    const old = fromDateKey("2026-11-05");
    const auto = autoReminderFor(old, PREFS, NY);
    expect(
      reminderAfterDeadlineChange(
        {
          previousDeadline: old,
          nextDeadline: fromDateKey("2026-11-10"),
          reminderAt: auto,
        },
        PREFS,
        NY,
      )?.toISOString(),
    ).toBe("2026-11-09T14:00:00.000Z");
    expect(
      reminderAfterDeadlineChange(
        { previousDeadline: old, nextDeadline: null, reminderAt: auto },
        PREFS,
        NY,
      ),
    ).toBeNull();
  });

  it("never overwrites a hand-set reminder", () => {
    const handSet = zonedWallTime("2026-11-03", 15 * 60, NY);
    for (const nextDeadline of [fromDateKey("2026-11-10"), null]) {
      expect(
        reminderAfterDeadlineChange(
          {
            previousDeadline: fromDateKey("2026-11-05"),
            nextDeadline,
            reminderAt: handSet,
          },
          PREFS,
          NY,
        ),
      ).toBeUndefined();
    }
  });

  it("does nothing when switched off or when the day did not change", () => {
    const change = {
      previousDeadline: null,
      nextDeadline: fromDateKey("2026-11-05"),
      reminderAt: null,
    };
    expect(
      reminderAfterDeadlineChange(change, { ...PREFS, autoReminder: false }, NY),
    ).toBeUndefined();
    expect(
      reminderAfterDeadlineChange(
        { ...change, previousDeadline: fromDateKey("2026-11-05") },
        PREFS,
        NY,
      ),
    ).toBeUndefined();
  });
});

describe("snoozeTarget", () => {
  it("adds minutes for the short choices", () => {
    expect(snoozeTarget("15m", NOW, PREFS, NY).toISOString()).toBe(
      "2026-10-29T16:15:00.000Z",
    );
  });

  it("means the reader's tomorrow, even late in the evening when UTC has rolled over", () => {
    const lateFriday = new Date("2026-10-31T02:30:00.000Z"); // Fri 22:30 EDT
    expect(snoozeTarget("tomorrow", lateFriday, PREFS, NY).toISOString()).toBe(
      "2026-10-31T13:00:00.000Z",
    );
  });

  it("lands at the morning time on the far side of the clock change", () => {
    const saturday = new Date("2026-10-31T20:00:00.000Z");
    expect(snoozeTarget("tomorrow", saturday, PREFS, NY).toISOString()).toBe(
      "2026-11-01T14:00:00.000Z",
    );
  });
});
