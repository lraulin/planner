import { describe, expect, it } from "vitest";
import { DATE_TOLERANCE_DAYS, syncWindow } from "./crossSource";

describe("syncWindow", () => {
  it("compares further back than it fetches, by at least the matcher's tolerance", () => {
    // The bug this exists for: loading existing rows from the fetch start hides statement
    // rows dated a day or two earlier, so every transaction on the boundary duplicates.
    // Three did on the first real run.
    const window = syncWindow("2026-08-10", "2026-08-16", 7, 45);
    expect(window.fetchFrom).toBe("2026-08-03");
    expect(window.compareFrom).toBe("2026-08-01");

    const gap =
      (Date.parse(`${window.fetchFrom}T00:00:00Z`) -
        Date.parse(`${window.compareFrom}T00:00:00Z`)) /
      86_400_000;
    expect(gap).toBeGreaterThanOrEqual(DATE_TOLERANCE_DAYS);
  });

  it("resumes from the anchor minus the overlap", () => {
    // The overlap is what catches a transaction that posts later than it happened.
    expect(syncWindow("2026-08-10", "2026-08-16", 7, 45).fetchFrom).toBe("2026-08-03");
  });

  it("falls back to the cap when there is nothing on file", () => {
    // A register with no history has nothing to anchor to, so reach as far as allowed.
    expect(syncWindow(null, "2026-08-16", 7, 45).fetchFrom).toBe("2026-07-02");
  });

  it("never reaches further back than the cap, however old the anchor", () => {
    // A connection left unsynced for a year must not request a year of history — the
    // provider warns past 45 days and may start refusing.
    expect(syncWindow("2025-01-01", "2026-08-16", 7, 45).fetchFrom).toBe("2026-07-02");
  });

  it("looks slightly past today, since a pending row can be dated ahead", () => {
    expect(syncWindow("2026-08-10", "2026-08-16", 7, 45).compareTo).toBe("2026-08-18");
  });
});
