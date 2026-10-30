import { describe, expect, it } from "vitest";
import { freshness, healthReport, SYNC_STALE_AFTER_MS } from "./report";

const now = new Date("2026-10-28T23:30:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("freshness", () => {
  it("is fresh across a day's worth of Hobby cron jitter and stale after a missed run", () => {
    expect(freshness(ago(25 * 60 * 60 * 1000), now).stale).toBe(false);
    expect(freshness(ago(SYNC_STALE_AFTER_MS), now).stale).toBe(false);
    expect(freshness(ago(SYNC_STALE_AFTER_MS + 1), now).stale).toBe(true);
  });

  it("calls a never-synced feature stale", () => {
    expect(freshness(null, now)).toEqual({ lastSyncedAt: null, stale: true });
  });
});

describe("healthReport", () => {
  const fresh = freshness(ago(1000), now);
  const stale = freshness(ago(SYNC_STALE_AFTER_MS * 2), now);

  it("is ok when everything set up is fresh, and ignores what is not set up", () => {
    expect(
      healthReport({
        databaseOk: true,
        commit: undefined,
        bankSync: fresh,
        calendarSync: null,
      }).status,
    ).toBe("ok");
  });

  it("is degraded when any sync is stale", () => {
    expect(
      healthReport({
        databaseOk: true,
        commit: "abc",
        bankSync: fresh,
        calendarSync: stale,
      }).status,
    ).toBe("degraded");
  });

  it("is down without the database and then reports no sync detail", () => {
    const report = healthReport({
      databaseOk: false,
      commit: "0123456789abcdef",
      bankSync: fresh,
      calendarSync: fresh,
    });
    expect(report).toEqual({
      status: "down",
      database: "unreachable",
      commit: "0123456",
      bankSync: null,
      calendarSync: null,
    });
  });
});
