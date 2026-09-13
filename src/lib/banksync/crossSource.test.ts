import { describe, expect, it } from "vitest";
import { DATE_TOLERANCE_DAYS, nextSyncedThrough, syncWindow } from "./crossSource";
import type { SimpleFinAccount } from "./mapping";

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

function accountAsOf(id: string, dateKey: string | null): SimpleFinAccount {
  return {
    id,
    name: id,
    balance: "0",
    "balance-date": dateKey
      ? Math.floor(
          Date.UTC(
            Number(dateKey.slice(0, 4)),
            Number(dateKey.slice(5, 7)) - 1,
            Number(dateKey.slice(8, 10)),
            12,
          ) / 1000,
        )
      : null,
  };
}

describe("nextSyncedThrough", () => {
  it("anchors on the stalest account, not the day this sync ran", () => {
    // Production case: Capital One stalled at Sep 8 for six days while another account
    // kept moving. The old code advanced to today regardless, so the next fetch started
    // past Sep 8 and two charges SimpleFIN was merely late on never arrived once it caught
    // up. The new anchor stays at the stalled account's own day.
    const accounts = [
      accountAsOf("stalled", "2026-09-08"),
      accountAsOf("moving", "2026-09-12"),
    ];
    expect(nextSyncedThrough(accounts, "2026-09-07", "2026-09-13")).toBe("2026-09-08");
  });

  it("leaves the anchor unchanged when nothing in the response has a balance date", () => {
    const accounts = [accountAsOf("no-date", null)];
    expect(nextSyncedThrough(accounts, "2026-09-05", "2026-09-13")).toBe("2026-09-05");
  });

  it("falls back to today when there is no prior anchor and nothing has a date", () => {
    expect(nextSyncedThrough([], null, "2026-09-13")).toBe("2026-09-13");
  });

  it("never advances past today, however far ahead a balance date claims to be", () => {
    const accounts = [accountAsOf("clock-skew", "2026-09-20")];
    expect(nextSyncedThrough(accounts, "2026-09-07", "2026-09-13")).toBe("2026-09-13");
  });

  it("ignores an account with no date rather than letting it hold the anchor back", () => {
    const accounts = [accountAsOf("dated", "2026-09-10"), accountAsOf("undated", null)];
    expect(nextSyncedThrough(accounts, "2026-09-01", "2026-09-13")).toBe("2026-09-10");
  });
});
