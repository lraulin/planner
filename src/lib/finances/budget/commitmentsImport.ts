import type { CommitmentStatus } from "@/db/schema";

import type { Template } from "./templates/types";

export const COMMITMENTS_BILLS_GROUP_KEY = "bills";
export const COMMITMENTS_CATEGORY_GROUP_PREFIX = "category:";
export const UNCATEGORIZED_BILLS_GROUP = "Uncategorized";

export type ImportBill = {
  id: string;
  name: string;
  status: CommitmentStatus;
  category: string;
  payeeIds: readonly string[];
};

export type ImportGroup = {
  id: string;
  parentGroupId: string | null;
  name: string;
  isIncome: boolean;
  sourceCommitmentKey: string | null;
};

export type ImportEnvelope = {
  id: string;
  groupId: string;
  name: string;
  sourceBillId: string | null;
  templates: readonly Template[];
};

export type ImportSchedule = {
  id: string;
  name: string;
  sourceBillId: string | null;
  budgetCategoryId: string | null;
};

export type BillImportPlan = {
  billId: string;
  name: string;
  categoryName: string;
  state: "create" | "adopt" | "existing" | "conflict" | "inactive";
  scheduleId: string | null;
  envelopeId: string | null;
  templateEnvelopeId: string | null;
  reason: string | null;
};

export type CommitmentsImportPlan = {
  targetGroupId: string;
  legacyEnvelopeId: string | null;
  billsGroupId: string | null;
  legacyEnvelopeMove: boolean;
  createGroupNames: string[];
  bills: BillImportPlan[];
  counts: {
    active: number;
    createEnvelopes: number;
    createSchedules: number;
    adoptEnvelopes: number;
    existing: number;
    inactive: number;
    conflicts: number;
  };
  blockingReason: string | null;
};

function scheduleTemplateEnvelopeIds(
  envelopes: readonly ImportEnvelope[],
  scheduleId: string,
): string[] {
  return envelopes
    .filter((envelope) =>
      envelope.templates.some(
        (template) =>
          template.type === "schedule" && template.scheduleId === scheduleId,
      ),
    )
    .map((envelope) => envelope.id);
}

/**
 * Decide what the explicit import would do without manufacturing ids or mutating its input.
 * The executor re-runs this immediately before writing and compares its fingerprint.
 */
export function planCommitmentsImport(input: {
  targetGroupId: string;
  legacyEnvelopeId: string | null;
  bills: readonly ImportBill[];
  groups: readonly ImportGroup[];
  envelopes: readonly ImportEnvelope[];
  schedules: readonly ImportSchedule[];
}): CommitmentsImportPlan {
  const target = input.groups.find((group) => group.id === input.targetGroupId);
  const legacy = input.legacyEnvelopeId
    ? (input.envelopes.find((envelope) => envelope.id === input.legacyEnvelopeId) ??
      null)
    : null;
  const billsGroup =
    input.groups.find(
      (group) => group.sourceCommitmentKey === COMMITMENTS_BILLS_GROUP_KEY,
    ) ??
    input.groups.find(
      (group) => group.parentGroupId === input.targetGroupId && group.name === "Bills",
    ) ??
    null;
  const otherBillsCollision = billsGroup
    ? input.envelopes.find(
        (envelope) =>
          envelope.groupId === billsGroup.id &&
          envelope.name === "Other bills" &&
          envelope.id !== legacy?.id,
      )
    : null;
  const blockingReason = !target
    ? "Choose a budget group that still exists."
    : target.isIncome
      ? "Commitments can only import into a spending group."
      : legacy && legacy.groupId !== target.id && legacy.groupId !== billsGroup?.id
        ? "The legacy envelope must be inside the selected spending branch."
        : legacy && otherBillsCollision
          ? "An Other bills envelope already exists in the imported Bills group."
          : null;

  const schedulesByBill = new Map(
    input.schedules.flatMap((schedule) =>
      schedule.sourceBillId ? [[schedule.sourceBillId, schedule] as const] : [],
    ),
  );
  const schedulesByName = new Map(
    input.schedules.map((schedule) => [schedule.name, schedule]),
  );
  const envelopesByBill = new Map(
    input.envelopes.flatMap((envelope) =>
      envelope.sourceBillId ? [[envelope.sourceBillId, envelope] as const] : [],
    ),
  );
  const createGroupNames = new Set<string>();
  if (!billsGroup) createGroupNames.add("Bills");

  const bills: BillImportPlan[] = [...input.bills]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((bill) => {
      const categoryName = bill.category.trim() || UNCATEGORIZED_BILLS_GROUP;
      if (bill.status !== "active") {
        return {
          billId: bill.id,
          name: bill.name,
          categoryName,
          state: "inactive" as const,
          scheduleId: null,
          envelopeId: null,
          templateEnvelopeId: null,
          reason: `${bill.status} bills are not imported.`,
        };
      }

      const existingEnvelope = envelopesByBill.get(bill.id) ?? null;
      const sourcedSchedule = schedulesByBill.get(bill.id) ?? null;
      const nameCollision = sourcedSchedule
        ? null
        : (schedulesByName.get(bill.name) ?? null);
      if (nameCollision) {
        return {
          billId: bill.id,
          name: bill.name,
          categoryName,
          state: "conflict" as const,
          scheduleId: null,
          envelopeId: null,
          templateEnvelopeId: null,
          reason: `A schedule named ${bill.name} exists without Commitments provenance.`,
        };
      }
      if (existingEnvelope) {
        return {
          billId: bill.id,
          name: bill.name,
          categoryName,
          state: "existing" as const,
          scheduleId: sourcedSchedule?.id ?? null,
          envelopeId: existingEnvelope.id,
          templateEnvelopeId: null,
          reason: null,
        };
      }

      const templateEnvelopeIds = sourcedSchedule
        ? scheduleTemplateEnvelopeIds(input.envelopes, sourcedSchedule.id)
        : [];
      if (templateEnvelopeIds.length > 1) {
        return {
          billId: bill.id,
          name: bill.name,
          categoryName,
          state: "conflict" as const,
          scheduleId: sourcedSchedule?.id ?? null,
          envelopeId: null,
          templateEnvelopeId: null,
          reason: "That schedule appears in more than one envelope.",
        };
      }

      const templateEnvelopeId = templateEnvelopeIds[0] ?? null;
      const routedEnvelopeId = sourcedSchedule?.budgetCategoryId ?? null;
      const adoptCandidates = [templateEnvelopeId, routedEnvelopeId].filter(
        (id): id is string => id !== null && id !== legacy?.id,
      );
      const distinctAdoptCandidates = [...new Set(adoptCandidates)];
      if (distinctAdoptCandidates.length > 1) {
        return {
          billId: bill.id,
          name: bill.name,
          categoryName,
          state: "conflict" as const,
          scheduleId: sourcedSchedule?.id ?? null,
          envelopeId: null,
          templateEnvelopeId,
          reason: "That schedule routes to a different envelope from its template.",
        };
      }
      const adoptedEnvelopeId = distinctAdoptCandidates[0] ?? null;
      const adopt = adoptedEnvelopeId !== null;
      const categoryGroup =
        input.groups.find(
          (group) =>
            group.sourceCommitmentKey ===
            `${COMMITMENTS_CATEGORY_GROUP_PREFIX}${categoryName}`,
        ) ??
        (billsGroup
          ? input.groups.find(
              (group) =>
                group.parentGroupId === billsGroup.id && group.name === categoryName,
            )
          : null);
      const envelopeNameCollision = categoryGroup
        ? input.envelopes.find(
            (envelope) =>
              envelope.groupId === categoryGroup.id && envelope.name === bill.name,
          )
        : null;
      if (!adopt && envelopeNameCollision) {
        return {
          billId: bill.id,
          name: bill.name,
          categoryName,
          state: "conflict" as const,
          scheduleId: sourcedSchedule?.id ?? null,
          envelopeId: null,
          templateEnvelopeId,
          reason: `An envelope named ${bill.name} already exists in ${categoryName}.`,
        };
      }
      if (!adopt) createGroupNames.add(categoryName);
      return {
        billId: bill.id,
        name: bill.name,
        categoryName,
        state: adopt ? ("adopt" as const) : ("create" as const),
        scheduleId: sourcedSchedule?.id ?? null,
        envelopeId: adoptedEnvelopeId,
        templateEnvelopeId,
        reason: null,
      };
    });

  return {
    targetGroupId: input.targetGroupId,
    legacyEnvelopeId: legacy?.id ?? null,
    billsGroupId: billsGroup?.id ?? null,
    legacyEnvelopeMove:
      legacy !== null &&
      (legacy.name !== "Other bills" || legacy.groupId !== billsGroup?.id),
    createGroupNames: [...createGroupNames],
    bills,
    counts: {
      active: bills.filter((bill) => bill.state !== "inactive").length,
      createEnvelopes: bills.filter((bill) => bill.state === "create").length,
      createSchedules: bills.filter(
        (bill) =>
          (bill.state === "create" || bill.state === "adopt") &&
          bill.scheduleId === null,
      ).length,
      adoptEnvelopes: bills.filter((bill) => bill.state === "adopt").length,
      existing: bills.filter((bill) => bill.state === "existing").length,
      inactive: bills.filter((bill) => bill.state === "inactive").length,
      conflicts: bills.filter((bill) => bill.state === "conflict").length,
    },
    blockingReason,
  };
}
