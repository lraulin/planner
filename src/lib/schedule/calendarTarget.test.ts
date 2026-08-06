import { describe, expect, it } from "vitest";
import { calendarTargetFrom } from "./calendarTarget";

/** A stand-in for a DOM element, holding only what the resolver reads. */
function el(attrs: Record<string, string>, classes: string[] = []): Element {
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
    classList: { contains: (name: string) => classes.includes(name) },
  } as unknown as Element;
}

const slotLane = (time: string) => el({ "data-time": time });
const column = (date: string) => el({ "data-date": date });

describe("calendarTargetFrom", () => {
  it("reads a date and a time out of two overlapping trees", () => {
    // The whole reason this takes a hit-test stack: the slot rows and the day columns are
    // separate tables laid over each other, so neither is an ancestor of the other.
    const target = calendarTargetFrom([slotLane("14:30:00"), column("2026-08-05")]);

    expect(target).toMatchObject({ kind: "slot", allDay: false });
    if (target.kind !== "slot") throw new Error("expected a slot");
    expect(target.start.getHours()).toBe(14);
    expect(target.start.getMinutes()).toBe(30);
    expect(target.start.getDate()).toBe(5);
  });

  it("prefers the appointment over the slot underneath it", () => {
    // `elementsFromPoint` is front-to-back. You right-clicked the event, not the 3pm it sits in.
    const target = calendarTargetFrom([
      el({ "data-appointment-id": "a1", "data-occurrence-key": "a1:2026-08-05" }),
      slotLane("15:00:00"),
      column("2026-08-05"),
    ]);

    expect(target).toEqual({
      kind: "event",
      appointmentId: "a1",
      occurrenceKey: "a1:2026-08-05",
    });
  });

  it("falls back to the appointment id when an occurrence key is missing", () => {
    const target = calendarTargetFrom([el({ "data-appointment-id": "a1" })]);
    expect(target).toMatchObject({ occurrenceKey: "a1" });
  });

  it("treats a dated cell with no time as the all-day strip", () => {
    const target = calendarTargetFrom([
      el({ "data-date": "2026-08-05" }, ["fc-daygrid-day"]),
    ]);
    expect(target).toMatchObject({ kind: "slot", allDay: true });
  });

  it("takes the nearest date when outer containers carry one too", () => {
    // The week wrapper has a `data-date` of its own; the column under the pointer is the answer.
    const target = calendarTargetFrom([
      slotLane("09:00:00"),
      column("2026-08-05"),
      column("2026-08-02"),
    ]);
    if (target.kind !== "slot") throw new Error("expected a slot");
    expect(target.start.getDate()).toBe(5);
  });

  it("resolves nothing when the pointer is on chrome rather than the grid", () => {
    // The header row, the scrollbar, the gap under the last slot: a menu there would be about
    // no particular time, which is worse than no menu.
    expect(calendarTargetFrom([el({}), el({ class: "fc-scroller" })])).toEqual({
      kind: "none",
    });
    expect(calendarTargetFrom([])).toEqual({ kind: "none" });
  });

  it("rejects malformed attributes rather than inventing a date", () => {
    expect(calendarTargetFrom([column("2026-8-5")])).toEqual({ kind: "none" });
    // A bad time on a good date still names a day, so it degrades to the all-day answer
    // rather than to nothing.
    expect(
      calendarTargetFrom([slotLane("25:00:00"), column("2026-08-05")]),
    ).toMatchObject({ kind: "slot", allDay: true });
  });
});
