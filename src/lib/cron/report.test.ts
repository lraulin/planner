import { describe, expect, it } from "vitest";
import type { SyncResult } from "@/lib/banksync/sync";
import {
  bankResultOk,
  calendarCronWindow,
  calendarStatusOk,
  cronReport,
  isCronJob,
} from "./report";

const counts = {
  inserted: 0,
  updated: 0,
  deleted: 0,
  skippedDuplicate: 0,
  skippedUnparseable: 0,
  retiredScrapeRows: 0,
  unlinkedAccounts: 0,
  balancesUpdated: 0,
  providerErrors: [],
};

function bank(...states: SyncResult["connections"]): SyncResult {
  return { connections: states, reclassified: false, auditBatchId: null };
}

describe("calendarCronWindow", () => {
  it("covers the past week through eight weeks ahead, on week boundaries", () => {
    const now = new Date(2026, 9, 28, 19, 30); // Wed Oct 28, evening
    const { start, end } = calendarCronWindow(now);

    expect(start.getDay()).toBe(0);
    expect(end.getDay()).toBe(0);
    expect(start.getTime()).toBeLessThanOrEqual(
      new Date(2026, 9, 21, 19, 30).getTime(),
    );
    expect(end.getTime()).toBeGreaterThanOrEqual(
      new Date(2026, 11, 23, 19, 30).getTime(),
    );
    // Not wildly wider than asked: whole-week rounding adds under a week at each end.
    expect(start.getTime()).toBeGreaterThan(new Date(2026, 9, 14).getTime());
    expect(end.getTime()).toBeLessThan(new Date(2026, 11, 31).getTime());
  });

  it("depends on the clock it is given, not the real one", () => {
    const a = calendarCronWindow(new Date(2027, 2, 10));
    expect(a.start.getFullYear()).toBe(2027);
    expect(a.start < new Date(2027, 2, 3)).toBe(true);
  });
});

describe("bankResultOk", () => {
  it("passes ok and not-linked connections and a user with none", () => {
    expect(bankResultOk(bank())).toBe(true);
    expect(
      bankResultOk(
        bank(
          { state: "ok", connectionId: "a", label: "A", counts },
          { state: "not_linked", connectionId: "b", label: "B" },
        ),
      ),
    ).toBe(true);
  });

  it("fails when any connection needs attention", () => {
    const ok = { state: "ok", connectionId: "a", label: "A", counts } as const;
    expect(
      bankResultOk(
        bank(ok, { state: "reauth_required", connectionId: "b", label: "B" }),
      ),
    ).toBe(false);
    expect(
      bankResultOk(
        bank(ok, {
          state: "subscription_lapsed",
          connectionId: "b",
          label: "B",
          message: "lapsed",
        }),
      ),
    ).toBe(false);
    expect(
      bankResultOk(
        bank(ok, { state: "failed", connectionId: "b", label: "B", message: "x" }),
      ),
    ).toBe(false);
  });
});

describe("calendarStatusOk", () => {
  it("fails only on failed and not-linked", () => {
    expect(calendarStatusOk({ state: "ok", inserted: 1, updated: 0, deleted: 0 })).toBe(
      true,
    );
    expect(calendarStatusOk({ state: "off" })).toBe(true);
    expect(calendarStatusOk({ state: "failed", message: "boom" })).toBe(false);
    expect(calendarStatusOk({ state: "not_linked", message: "revoked" })).toBe(false);
  });
});

describe("cronReport", () => {
  it("is ok only when every user is ok, and an empty run is ok", () => {
    expect(cronReport("bank-sync", []).ok).toBe(true);
    expect(
      cronReport("bank-sync", [
        { userId: "u1", ok: true, result: 1 },
        { userId: "u2", ok: false, error: "x" },
      ]).ok,
    ).toBe(false);
  });
});

describe("isCronJob", () => {
  it("knows exactly the scheduled jobs", () => {
    expect(isCronJob("bank-sync")).toBe(true);
    expect(isCronJob("calendar-sync")).toBe(true);
    expect(isCronJob("health")).toBe(false);
    expect(isCronJob("")).toBe(false);
  });
});
