import { describe, expect, it } from "vitest";

import { backupFileName, type BackupGeneration } from "./generations";
import { isoWeekKey, planRetention } from "./retention";

describe("ISO week buckets", () => {
  it("uses the ISO week-year across the UTC new-year boundary", () => {
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2027-01-04T00:00:00Z"))).toBe("2027-W01");
  });
});

describe("backup retention", () => {
  it("keeps one newest generation per UTC day while allowing tier overlap", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const newest = generation("2026-09-05T10:00:00Z");
    const olderToday = generation("2026-09-05T08:00:00Z");
    const yesterday = generation("2026-09-04T23:00:00Z");

    const result = planRetention([olderToday, yesterday, newest], now);

    expect(result.keep.map((item) => item.fileName)).toEqual([
      newest.fileName,
      yesterday.fileName,
    ]);
    expect(result.prune.map((item) => item.fileName)).toEqual([olderToday.fileName]);
  });

  it("keeps weekly and monthly generations after their daily buckets expire", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const recent = generation("2026-09-05T10:00:00Z");
    const priorWeek = generation("2026-08-24T10:00:00Z");
    const priorMonth = generation("2026-04-03T10:00:00Z");
    const expired = generation("2025-08-01T10:00:00Z");

    const result = planRetention([priorMonth, expired, recent, priorWeek], now);

    expect(result.keep.map((item) => item.fileName)).toEqual([
      recent.fileName,
      priorWeek.fileName,
      priorMonth.fileName,
    ]);
    expect(result.prune.map((item) => item.fileName)).toEqual([expired.fileName]);
  });

  it("protects a future-dated valid generation from automatic pruning", () => {
    const future = generation("2026-09-06T00:00:00Z");
    const result = planRetention([future], new Date("2026-09-05T12:00:00Z"));
    expect(result.keep).toEqual([future]);
    expect(result.prune).toEqual([]);
  });
});

function generation(timestamp: string): BackupGeneration {
  const createdAt = new Date(timestamp);
  const fileName = backupFileName(createdAt);
  return {
    createdAt,
    fileName,
    filePath: `/backups/${fileName}`,
    checksumPath: `/backups/${fileName}.sha256`,
    manifestPath: `/backups/${fileName}.manifest.json`,
    encryptedBytes: 1,
    sha256: "a".repeat(64),
  };
}
