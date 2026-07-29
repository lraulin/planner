import { describe, expect, it } from "vitest";
import type { TimeChartArea } from "@/db/schema";
import {
  expandAreasForTemplate,
  rangeToAreaTiming,
  TIME_CHART_TEMPLATE_WEEK_START,
  weekdayOfTemplateDate,
} from "./timeChartTemplate";
import { fromDateKey } from "./geometry";

function area(partial: Partial<TimeChartArea> = {}): TimeChartArea {
  return {
    id: "area-1",
    userId: "user-1",
    timeChartId: "chart-1",
    resultAreaId: null,
    name: "Deep Work",
    daysOfWeek: [1],
    startMinute: 9 * 60,
    durationMinutes: 90,
    labelEnabled: true,
    foreColor: "#1b1d23",
    backColor: "#c8e0f0",
    description: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("expandAreasForTemplate", () => {
  it("emits one event per selected weekday, keyed by area and day", () => {
    const events = expandAreasForTemplate([area({ daysOfWeek: [1, 3, 5] })]);
    expect(events.map((e) => e.id)).toEqual(["area-1:1", "area-1:3", "area-1:5"]);
    expect(events.map((e) => e.weekday)).toEqual([1, 3, 5]);
  });

  it("places each event on the matching weekday of the template week", () => {
    const events = expandAreasForTemplate([area({ daysOfWeek: [0, 6] })]);
    expect(events.map((e) => e.start.getDay())).toEqual([0, 6]);
  });

  it("honours startMinute and durationMinutes as local wall-clock time", () => {
    const [event] = expandAreasForTemplate([
      area({ startMinute: 9 * 60 + 30, durationMinutes: 45 }),
    ]);
    expect([event.start.getHours(), event.start.getMinutes()]).toEqual([9, 30]);
    expect([event.end.getHours(), event.end.getMinutes()]).toEqual([10, 15]);
  });

  it("drops weekdays outside 0–6 rather than emitting a bogus date", () => {
    const events = expandAreasForTemplate([area({ daysOfWeek: [-1, 2, 7] })]);
    expect(events.map((e) => e.weekday)).toEqual([2]);
  });

  it("blanks the title when the label is disabled", () => {
    const [labelled] = expandAreasForTemplate([area({ labelEnabled: true })]);
    const [unlabelled] = expandAreasForTemplate([area({ labelEnabled: false })]);
    expect(labelled.title).toBe("Deep Work");
    expect(unlabelled.title).toBe("");
  });

  it("falls back to a placeholder for an unnamed but labelled area", () => {
    const [event] = expandAreasForTemplate([area({ name: "", labelEnabled: true })]);
    expect(event.title).toBe("(untitled)");
  });

  it("anchors to a Sunday so weekday N lands on column N", () => {
    expect(TIME_CHART_TEMPLATE_WEEK_START.getDay()).toBe(0);
  });
});

describe("rangeToAreaTiming", () => {
  it("converts a dragged range to start minute and duration", () => {
    const start = fromDateKey("2026-03-02");
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 90 * 60_000);
    expect(rangeToAreaTiming(start, end)).toEqual({
      startMinute: 9 * 60,
      durationMinutes: 90,
    });
  });

  it("snaps to the 15-minute grid", () => {
    const start = fromDateKey("2026-03-02");
    start.setHours(9, 7, 0, 0);
    const end = new Date(start.getTime() + 22 * 60_000);
    const { startMinute, durationMinutes } = rangeToAreaTiming(start, end);
    expect(startMinute % 15).toBe(0);
    expect(durationMinutes % 15).toBe(0);
  });

  it("never produces a zero-length area from a click without a drag", () => {
    const start = fromDateKey("2026-03-02");
    start.setHours(9, 0, 0, 0);
    const { durationMinutes } = rangeToAreaTiming(start, new Date(start));
    expect(durationMinutes).toBeGreaterThanOrEqual(15);
  });
});

describe("weekdayOfTemplateDate", () => {
  it("reads the column straight off the date", () => {
    // Sun 2026-03-01 through Sat 2026-03-07.
    const keys = [
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
    ];
    expect(keys.map((k) => weekdayOfTemplateDate(fromDateKey(k)))).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("is unaffected by a DST transition inside the week", () => {
    // US DST begins Sun 2026-03-08; the column is still Sunday.
    expect(weekdayOfTemplateDate(fromDateKey("2026-03-08"))).toBe(0);
  });
});
