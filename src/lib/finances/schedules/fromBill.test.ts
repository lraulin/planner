import { describe, expect, it } from "vitest";
import { CADENCE_CHOICES, cadenceColumns } from "@/lib/finances/recurringBills";
import { billDrift, billToScheduleConditions, type BillForSchedule } from "./fromBill";
import { dateConfigOf, extractScheduleConds } from "./conditions";

const PAYEE_A = "11111111-1111-4111-8111-111111111111";
const PAYEE_B = "22222222-2222-4222-8222-222222222222";

function bill(overrides: Partial<BillForSchedule> = {}): BillForSchedule {
  return {
    id: "bill-1",
    name: "Netflix",
    payeeIds: [PAYEE_A],
    status: "active",
    cadenceMonths: 1,
    cadenceDays: null,
    expectedCents: 1599,
    anchorDate: "2026-01-15",
    scheduled: true,
    dueDay: 15,
    ...overrides,
  };
}

describe("billToScheduleConditions", () => {
  it("round-trips every CADENCE_CHOICES entry", () => {
    for (const cadence of CADENCE_CHOICES) {
      const columns = cadenceColumns(cadence);
      const mapped = extractScheduleConds(
        billToScheduleConditions(
          bill({ ...columns, dueDay: cadence.unit === "month" ? 15 : null }),
          "2026-08-22",
        ),
      );
      const config = dateConfigOf(mapped.date);
      expect(config, cadence.unit + String(cadence.n)).not.toBeNull();
      if (cadence.unit === "day" && cadence.n % 7 === 0) {
        expect(config?.frequency).toBe("weekly");
        expect(config?.interval).toBe(cadence.n / 7);
      } else if (cadence.unit === "day") {
        expect(config?.frequency).toBe("daily");
        expect(config?.interval).toBe(cadence.n);
      } else if (cadence.n === 12) {
        expect(config?.frequency).toBe("yearly");
        expect(config?.interval).toBe(1);
      } else {
        expect(config?.frequency).toBe("monthly");
        expect(config?.interval).toBe(cadence.n);
      }
    }
  });

  it("keeps dueDay 31 as a day-of-month pattern", () => {
    const mapped = extractScheduleConds(
      billToScheduleConditions(bill({ dueDay: 31, cadenceMonths: 1 }), "2026-08-22"),
    );
    expect(dateConfigOf(mapped.date)?.patterns).toEqual([{ type: "day", value: 31 }]);
  });

  it("uses today as start when the bill has no anchorDate", () => {
    const mapped = extractScheduleConds(
      billToScheduleConditions(bill({ anchorDate: null }), "2026-08-22"),
    );
    expect(dateConfigOf(mapped.date)?.start).toBe("2026-08-22");
  });

  it("stores expectedCents as a negative isapprox amount", () => {
    const mapped = extractScheduleConds(billToScheduleConditions(bill(), "2026-08-22"));
    expect(mapped.amount).toEqual({ field: "amount", op: "isapprox", value: -1599 });
  });

  it("uses payee oneOf when the bill has several payees", () => {
    const mapped = extractScheduleConds(
      billToScheduleConditions(bill({ payeeIds: [PAYEE_A, PAYEE_B] }), "2026-08-22"),
    );
    expect(mapped.payee).toEqual({
      field: "payee",
      op: "oneOf",
      value: [PAYEE_A, PAYEE_B],
    });
  });
});

describe("billDrift", () => {
  it("is silent when the schedule still matches the bill", () => {
    const source = bill();
    const conditions = billToScheduleConditions(source, "2026-08-22");
    expect(
      billDrift({ conditions, nextDate: "2026-09-15" }, source, "2026-08-22"),
    ).toEqual({ cadence: false, amount: false, nextDue: false });
  });

  it("flags an amount the user changed on the schedule", () => {
    const source = bill();
    const conditions = billToScheduleConditions(source, "2026-08-22").map((c) =>
      c.field === "amount"
        ? { field: "amount" as const, op: "isapprox" as const, value: -2000 }
        : c,
    );
    expect(
      billDrift({ conditions, nextDate: "2026-09-15" }, source, "2026-08-22").amount,
    ).toBe(true);
  });
});
