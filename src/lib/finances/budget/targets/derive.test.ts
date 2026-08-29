import { describe, expect, it } from "vitest";

import { targetDemand, type DemandEnvelope } from "./demand";
import { deriveTarget, hasTargetAsk, resolveTarget, type BillSnapshot } from "./derive";
import type { Target } from "./types";

function bill(parts: Partial<BillSnapshot> = {}): BillSnapshot {
  return {
    id: "b1",
    name: "Rent",
    cadenceMonths: 1,
    cadenceDays: null,
    expectedCents: 150_000,
    nextDueKey: "2026-08-01",
    expectedKey: "2026-08-01",
    ...parts,
  };
}

function envelope(parts: Partial<DemandEnvelope> = {}): DemandEnvelope {
  return {
    id: "b1",
    name: "Rent",
    kind: "bill",
    target: null,
    carryInCents: 0,
    activityCents: 0,
    ...parts,
  };
}

const billsOf = (...snapshots: BillSnapshot[]) =>
  new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));

describe("deriveTarget", () => {
  it("seeds a schedule target from the bill's own amount", () => {
    expect(deriveTarget(bill())).toEqual({
      behavior: "upTo",
      cadence: { unit: "schedule" },
      amountCents: 150_000,
    });
  });

  it("produces nothing for a bill with no expected amount", () => {
    expect(deriveTarget(bill({ expectedCents: 0 }))).toBeNull();
  });
});

describe("resolveTarget", () => {
  it("lets an explicit target win over the bill's cadence", () => {
    const stored: Target = {
      behavior: "add",
      cadence: { unit: "month", day: 1 },
      amountCents: 999,
    };
    const resolved = resolveTarget(envelope({ target: stored }), billsOf(bill()));
    expect(resolved).toEqual({
      target: stored,
      bill: null,
      derived: false,
      errors: [],
    });
  });

  it("says so when a bill has no next-due date yet", () => {
    const resolved = resolveTarget(envelope(), new Map());
    expect(resolved.errors).toEqual(["Bill has no next-due date yet"]);
    expect(resolved.target).toBeNull();
  });

  it("gives a non-bill envelope with no target nothing to ask for", () => {
    const resolved = resolveTarget(
      envelope({ kind: "spending", id: "s1" }),
      billsOf(bill()),
    );
    expect(resolved.target).toBeNull();
    expect(resolved.errors).toEqual([]);
  });
});

describe("hasTargetAsk", () => {
  it("is true for any bill and for anything holding a target", () => {
    expect(hasTargetAsk({ id: "b1", kind: "bill", target: null })).toBe(true);
    expect(hasTargetAsk({ id: "s1", kind: "spending", target: null })).toBe(false);
    expect(
      hasTargetAsk({
        id: "s1",
        kind: "spending",
        target: { behavior: "add", cadence: { unit: "month", day: 1 }, amountCents: 1 },
      }),
    ).toBe(true);
  });
});

/**
 * `month-ahead-zero-based` D1 is not superseded by this spec — the deriver has to reproduce
 * it. If any of these move, the deriver is wrong, not that spec.
 */
describe("a monthly bill still does not sink across months", () => {
  const rent = bill({ nextDueKey: "2026-08-01", expectedKey: "2026-08-01" });
  const bills = billsOf(rent);

  it("asks the full amount in the due month", () => {
    expect(targetDemand(envelope(), "2026-08-01", bills).amount).toBe(150_000);
  });

  it("asks $0 in every other month", () => {
    expect(targetDemand(envelope(), "2026-07-01", bills).amount).toBe(0);
    expect(targetDemand(envelope(), "2026-09-01", bills).amount).toBe(0);
  });

  it("asks $0 when carry-in already covers it", () => {
    const funded = envelope({ carryInCents: 150_000 });
    expect(targetDemand(funded, "2026-08-01", bills).amount).toBe(0);
  });

  it("asks only the shortfall when carry-in covers part of it", () => {
    const partly = envelope({ carryInCents: 50_000 });
    expect(targetDemand(partly, "2026-08-01", bills).amount).toBe(100_000);
  });
});

describe("a paid bill stops asking and a late one does not", () => {
  it("goes quiet once the charge posts", () => {
    // Paid on the 1st: activity carries the charge and the outstanding charge is September's.
    const paid = billsOf(bill({ nextDueKey: "2026-09-01", expectedKey: "2026-09-01" }));
    const spent = envelope({ carryInCents: 150_000, activityCents: -150_000 });
    expect(targetDemand(spent, "2026-08-01", paid).amount).toBe(0);
  });

  it("keeps asking past its due date while it is still unpaid", () => {
    // Due the 15th, never charged: `nextDueKey` has rolled to September, `expectedKey` has not.
    const late = billsOf(bill({ nextDueKey: "2026-09-15", expectedKey: "2026-08-15" }));
    expect(targetDemand(envelope(), "2026-08-01", late).amount).toBe(150_000);
  });

  it("asks once, not twice, when a paid bill's payee anchor lags", () => {
    const stale = billsOf(
      bill({ nextDueKey: "2026-08-01", expectedKey: "2026-08-01" }),
    );
    const spent = envelope({ activityCents: -150_000 });

    // The bill's own amount, once. `paidFromActivity` used to be needed here because Activity
    // sat in the basis and asked for the charge a second time; with the basis on carry-in the
    // arithmetic gets there by itself (`target-refill-basis` D4).
    expect(targetDemand(spent, "2026-08-01", stale).amount).toBe(150_000);
  });

  it("does not let incidental spending inflate the bill's ask", () => {
    const stale = billsOf(
      bill({ nextDueKey: "2026-08-01", expectedKey: "2026-08-01" }),
    );
    const incidental = envelope({ activityCents: -1_200 });

    // The $12 is overspend, and `assignedToZeroBalance` is what asks for it back — the target
    // asks for the charge and nothing else.
    expect(targetDemand(incidental, "2026-08-01", stale).amount).toBe(150_000);
  });
});

describe("yearly and quarterly bills still sink", () => {
  const propane = bill({
    id: "p1",
    name: "Propane",
    cadenceMonths: 12,
    cadenceDays: null,
    expectedCents: 120_000,
    nextDueKey: "2026-10-15",
    expectedKey: "2026-10-15",
  });
  const bills = billsOf(propane);
  const p = (parts: Partial<DemandEnvelope> = {}) => envelope({ id: "p1", ...parts });

  it("divides the remaining hole by the months until the charge, inclusive", () => {
    expect(targetDemand(p(), "2026-08-01", bills).amount).toBe(40_000);
    expect(targetDemand(p({ carryInCents: 40_000 }), "2026-09-01", bills).amount).toBe(
      40_000,
    );
  });

  it("asks the whole remaining hole in the charge month", () => {
    expect(targetDemand(p({ carryInCents: 80_000 }), "2026-10-01", bills).amount).toBe(
      40_000,
    );
  });

  it("sinks a quarterly bill over its three months", () => {
    const quarterly = billsOf(
      bill({
        id: "q1",
        cadenceMonths: 3,
        expectedCents: 30_000,
        nextDueKey: "2026-10-10",
        expectedKey: "2026-10-10",
      }),
    );
    expect(targetDemand(envelope({ id: "q1" }), "2026-08-01", quarterly).amount).toBe(
      10_000,
    );
  });
});

describe("a weekly bill sums the charges still outstanding", () => {
  const daycare = bill({
    id: "d1",
    cadenceMonths: 0,
    cadenceDays: 7,
    expectedCents: 20_000,
    nextDueKey: "2026-08-20",
    expectedKey: "2026-08-20",
  });
  const bills = billsOf(daycare);

  it("counts the charges still outstanding, not every charge in the month", () => {
    // Charges on the 6th, 13th, 20th and 27th; the 20th is the one being waited for, so two
    // are outstanding — the calendar and today have nothing to do with it.
    expect(targetDemand(envelope({ id: "d1" }), "2026-08-01", bills).amount).toBe(
      40_000,
    );
  });

  it("subtracts what carried in, like any other refill", () => {
    const held = envelope({ id: "d1", carryInCents: 20_000 });
    expect(targetDemand(held, "2026-08-01", bills).amount).toBe(20_000);
  });
});
