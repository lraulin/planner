import { describe, expect, it } from "vitest";

import type { Template } from "./templates/types";
import {
  planCommitmentsImport,
  type ImportBill,
  type ImportEnvelope,
  type ImportGroup,
  type ImportSchedule,
} from "./commitmentsImport";

const bills: ImportBill[] = [
  { id: "rent", name: "Rent", status: "active", category: "", payeeIds: ["p"] },
  {
    id: "old",
    name: "Old service",
    status: "cancelled",
    category: "AI",
    payeeIds: [],
  },
];

function scheduleTemplate(scheduleId: string): Template {
  return {
    id: `template-${scheduleId}`,
    directive: "template",
    type: "schedule",
    priority: 0,
    scheduleId,
  };
}

function input(): {
  targetGroupId: string;
  legacyEnvelopeId: string | null;
  bills: ImportBill[];
  groups: ImportGroup[];
  envelopes: ImportEnvelope[];
  schedules: ImportSchedule[];
} {
  return {
    targetGroupId: "spending",
    legacyEnvelopeId: "legacy",
    bills,
    groups: [
      {
        id: "spending",
        parentGroupId: null,
        name: "Spending",
        isIncome: false,
        sourceCommitmentKey: null,
      },
    ],
    envelopes: [
      {
        id: "legacy",
        groupId: "spending",
        name: "Bills",
        sourceBillId: null,
        templates: [scheduleTemplate("rent-schedule")],
      },
    ],
    schedules: [
      {
        id: "rent-schedule",
        name: "Rent",
        sourceBillId: "rent",
        budgetCategoryId: null,
      },
    ],
  };
}

describe("planCommitmentsImport", () => {
  it("creates one active bill under Uncategorized and reports inactive bills", () => {
    const plan = planCommitmentsImport(input());
    expect(plan.createGroupNames).toEqual(["Bills", "Uncategorized"]);
    expect(plan.bills).toEqual([
      expect.objectContaining({ name: "Old service", state: "inactive" }),
      expect.objectContaining({
        name: "Rent",
        state: "create",
        categoryName: "Uncategorized",
        templateEnvelopeId: "legacy",
      }),
    ]);
    expect(plan.counts).toMatchObject({
      createEnvelopes: 1,
      createSchedules: 0,
      inactive: 1,
    });
  });

  it("preserves a renamed and moved imported envelope on replay", () => {
    const current = input();
    current.envelopes.push({
      id: "rent-envelope",
      groupId: "somewhere-else",
      name: "Housing payment",
      sourceBillId: "rent",
      templates: [],
    });
    expect(planCommitmentsImport(current).bills[1]).toMatchObject({
      state: "existing",
      envelopeId: "rent-envelope",
    });
  });

  it("adopts the envelope uniquely identified by an existing schedule template", () => {
    const current = input();
    current.envelopes[0].templates = [];
    current.envelopes.push({
      id: "manual",
      groupId: "spending",
      name: "My rent",
      sourceBillId: null,
      templates: [scheduleTemplate("rent-schedule")],
    });
    expect(planCommitmentsImport(current).bills[1]).toMatchObject({
      state: "adopt",
      envelopeId: "manual",
    });
  });

  it("adopts an existing schedule route when no envelope has import provenance", () => {
    const current = input();
    current.envelopes[0].templates = [];
    current.envelopes.push({
      id: "routed",
      groupId: "spending",
      name: "My rent",
      sourceBillId: null,
      templates: [],
    });
    current.schedules[0].budgetCategoryId = "routed";

    expect(planCommitmentsImport(current).bills[1]).toMatchObject({
      state: "adopt",
      envelopeId: "routed",
    });
  });

  it("reports an ambiguous same-name schedule without partially adopting it", () => {
    const current = input();
    current.schedules = [
      {
        id: "manual",
        name: "Rent",
        sourceBillId: null,
        budgetCategoryId: null,
      },
    ];
    expect(planCommitmentsImport(current).bills[1]).toMatchObject({
      state: "conflict",
      envelopeId: null,
    });
  });

  it("keeps an unrelated active bill actionable when another bill conflicts", () => {
    const current = input();
    current.bills.push({
      id: "phone",
      name: "Phone",
      status: "active",
      category: "Phone & Internet",
      payeeIds: ["phone-payee"],
    });
    current.schedules = [
      {
        id: "manual",
        name: "Rent",
        sourceBillId: null,
        budgetCategoryId: null,
      },
    ];

    const plan = planCommitmentsImport(current);
    expect(plan.bills.find((bill) => bill.name === "Rent")?.state).toBe("conflict");
    expect(plan.bills.find((bill) => bill.name === "Phone")?.state).toBe("create");
    expect(plan.counts).toMatchObject({ conflicts: 1, createEnvelopes: 1 });
  });

  it("blocks an income destination", () => {
    const current = input();
    current.groups[0].isIncome = true;
    expect(planCommitmentsImport(current).blockingReason).toContain("spending");
  });
});
