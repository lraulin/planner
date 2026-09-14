import { describe, expect, it } from "vitest";
import { reconcileAdjustment } from "./reconcileAdjustment";

describe("reconcileAdjustment", () => {
  it("writes an adjustment for exactly the confirmed difference", () => {
    const row = reconcileAdjustment("acct-1", 5_000, "2026-09-14");
    expect(row).toEqual({
      accountId: "acct-1",
      transactionDate: "2026-09-14",
      amountCents: 5_000,
      description: "Reconcile adjustment",
      flowOverride: "income",
      externalSource: "reconcile",
    });
  });

  it("keeps a negative difference negative — a downward correction, not an absolute value", () => {
    const row = reconcileAdjustment("acct-1", -1_234, "2026-09-14");
    expect(row?.amountCents).toBe(-1_234);
    expect(row?.flowOverride).toBe("income");
  });

  it("writes nothing when the difference is already zero", () => {
    expect(reconcileAdjustment("acct-1", 0, "2026-09-14")).toBeNull();
  });

  it("dates the adjustment today, never backdated into history", () => {
    const row = reconcileAdjustment("acct-1", 100, "2026-01-01");
    expect(row?.transactionDate).toBe("2026-01-01");
  });

  it("marks its own provenance so it can be told apart from real bank data", () => {
    const row = reconcileAdjustment("acct-1", 100, "2026-09-14");
    expect(row?.externalSource).toBe("reconcile");
  });

  it("refuses fractional cents", () => {
    expect(() => reconcileAdjustment("acct-1", 10.5, "2026-09-14")).toThrow(
      /integer cents/,
    );
  });
});
