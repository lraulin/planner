import { describe, expect, it } from "vitest";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import { appointmentsForDay } from "./appointments";

function occurrence(
  over: Partial<{
    occurrenceKey: string;
    subject: string;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
    checkState: "open" | "done" | "missed";
  }> = {},
) {
  const startAt = over.startAt ?? new Date(2026, 7, 12, 9, 0);
  return {
    occurrenceKey: over.occurrenceKey ?? `appt@${startAt.toISOString()}`,
    subject: over.subject ?? "Standup",
    startAt,
    endAt: over.endAt ?? new Date(startAt.getTime() + 30 * 60_000),
    allDay: over.allDay ?? false,
    checkState: over.checkState ?? "open",
  };
}

describe("appointmentsForDay", () => {
  it("files a late-evening appointment on the wall-clock day, not the UTC day", () => {
    // 9pm Eastern is already 1am UTC the next calendar day. `toDateKey` would move it.
    const startAt = new Date(2026, 7, 12, 21, 0);
    expect(toDateKey(startAt)).toBe("2026-08-13");

    const rows = appointmentsForDay(
      [occurrence({ subject: "Late", startAt })],
      "2026-08-12",
    );
    expect(rows.map((row) => row.subject)).toEqual(["Late"]);
    expect(appointmentsForDay([occurrence({ startAt })], "2026-08-13")).toEqual([]);
  });

  it("keeps an all-day row stored as UTC noon on that calendar day", () => {
    const startAt = fromDateKey("2026-08-12");
    const rows = appointmentsForDay(
      [occurrence({ subject: "Away", startAt, allDay: true })],
      "2026-08-12",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].allDay).toBe(true);
  });

  it("uses the occurrence key as the row id so a series can appear twice", () => {
    const rows = appointmentsForDay(
      [
        occurrence({
          occurrenceKey: "series@wed",
          subject: "Standup",
          startAt: new Date(2026, 7, 12, 9, 0),
        }),
        occurrence({
          occurrenceKey: "series@thu",
          subject: "Standup",
          startAt: new Date(2026, 7, 13, 9, 0),
        }),
      ],
      "2026-08-12",
    );
    expect(rows.map((row) => row.id)).toEqual(["series@wed"]);
  });
});
