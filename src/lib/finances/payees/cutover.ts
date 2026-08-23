/**
 * Pure plan for replacing legacy commitment/schedule merchant strings with payee ids.
 *
 * The executor runs this twice: once to prove the existing state is safe and discover any
 * placeholder payees, then again after creating those placeholders inside the same database
 * transaction. Only the second plan can be written. Keeping resolution and parity here makes
 * the dangerous part testable without Postgres.
 *
 * Spec: `agent-os/specs/2026-08-23-1041-payee-matcher-cutover/` D1–D5.
 */

import { normalizeMerchant } from "../classify/merchant";
import { parseConditions, type ScheduleCondition } from "../schedules/conditions";

export type CommitmentRef = { kind: "bill" | "spend"; id: string; name: string };

export type CutoverPayee = {
  id: string;
  name: string;
  aliases: readonly string[];
  claim: Omit<CommitmentRef, "name"> | null;
};

export type LegacyCommitment = CommitmentRef & { matchers: readonly string[] };

export type LegacySchedule = {
  id: string;
  name: string;
  conditions: unknown;
};

export type ParityTransaction = {
  id: string;
  legacyMerchant: string;
  payeeId: string | null;
  payeeName: string | null;
  amountCents: number;
  isOpaquePaypal: boolean;
};

export type PayeeRef =
  { type: "existing"; id: string } | { type: "create"; key: string };

export type PlaceholderPayee = { key: string; name: string; alias: string };

export type ClaimAssignment = {
  payee: PayeeRef;
  commitment: CommitmentRef;
};

export type ClaimRelease = {
  payeeId: string;
  commitment: Omit<CommitmentRef, "name">;
};

export type ScheduleUpdate = {
  id: string;
  name: string;
  conditions: ScheduleCondition[];
};

export type CutoverConflict = {
  payee: PayeeRef;
  commitments: CommitmentRef[];
};

export type ParityDifference = {
  commitment: CommitmentRef;
  legacyTransactionIds: string[];
  payeeTransactionIds: string[];
  legacyOnly: ParityTransaction[];
  payeeOnly: ParityTransaction[];
};

export type PayeeCutoverPlan = {
  creates: PlaceholderPayee[];
  /** Complete desired state, including claims that are already correct. */
  desiredClaims: ClaimAssignment[];
  claims: ClaimAssignment[];
  releases: ClaimRelease[];
  scheduleUpdates: ScheduleUpdate[];
  conflicts: CutoverConflict[];
  malformedSchedules: { id: string; name: string }[];
  unresolvedValues: { owner: string; value: string }[];
  parityDifferences: ParityDifference[];
  acceptedParityCorrections: ParityDifference[];
  blockingParityDifferences: ParityDifference[];
  canApply: boolean;
  isIdempotent: boolean;
};

export type PayeeCutoverInput = {
  payees: readonly CutoverPayee[];
  commitments: readonly LegacyCommitment[];
  schedules: readonly LegacySchedule[];
  transactions: readonly ParityTransaction[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALIDATION_PAYEE_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Validate a Stage A schedule without asking the Stage B parser to accept merchant text.
 * The compatibility shape belongs only to this retired cutover planner; runtime schedule
 * readers remain UUID-only.
 */
function parseLegacyConditions(raw: unknown): ScheduleCondition[] | null {
  if (!Array.isArray(raw)) return null;
  const validationShape = raw.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      return entry;
    if (!("field" in entry) || entry.field !== "payee") return entry;
    if (!("op" in entry) || !("value" in entry)) return entry;
    if (entry.op === "is" && typeof entry.value === "string") {
      return { ...entry, value: VALIDATION_PAYEE_ID };
    }
    if (
      entry.op === "oneOf" &&
      Array.isArray(entry.value) &&
      entry.value.every((value: unknown) => typeof value === "string")
    ) {
      return { ...entry, value: entry.value.map(() => VALIDATION_PAYEE_ID) };
    }
    return entry;
  });
  const parsed = parseConditions(validationShape);
  if (!parsed) return null;
  return parsed.map((condition, index) => {
    if (condition.field !== "payee") return condition;
    const original = raw[index];
    if (typeof original !== "object" || original === null || Array.isArray(original)) {
      return condition;
    }
    const value = "value" in original ? original.value : null;
    return condition.op === "is"
      ? { ...condition, value: value as string }
      : { ...condition, value: value as string[] };
  });
}

function refKey(ref: PayeeRef): string {
  return ref.type === "existing" ? `existing:${ref.id}` : `create:${ref.key}`;
}

function sameCommitment(
  left: Pick<CommitmentRef, "kind" | "id">,
  right: Pick<CommitmentRef, "kind" | "id">,
): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function commitmentRef(commitment: LegacyCommitment): CommitmentRef {
  return { kind: commitment.kind, id: commitment.id, name: commitment.name };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((entry) => rightSet.has(entry));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function conditionValues(condition: ScheduleCondition): string[] {
  if (condition.field !== "payee") return [];
  return condition.op === "is" ? [condition.value] : condition.value;
}

function isAcceptedParityCorrection(difference: ParityDifference): boolean {
  return (
    difference.legacyOnly.length === 0 &&
    difference.payeeOnly.length > 0 &&
    difference.payeeOnly.every(
      (row) => row.isOpaquePaypal && row.payeeId !== null && row.payeeName !== null,
    )
  );
}

/** Build a deterministic, write-free cutover plan. */
export function planPayeeCutover(input: PayeeCutoverInput): PayeeCutoverPlan {
  const byId = new Map(input.payees.map((payee) => [payee.id, payee]));
  const byAlias = new Map<string, CutoverPayee>();
  const byName = new Map<string, CutoverPayee>();
  const unresolvedValues: PayeeCutoverPlan["unresolvedValues"] = [];
  const creates = new Map<string, PlaceholderPayee>();

  for (const payee of input.payees) {
    byName.set(payee.name.trim().toLocaleLowerCase(), payee);
    for (const alias of payee.aliases) byAlias.set(alias, payee);
  }

  const resolve = (raw: string, owner: string): PayeeRef | null => {
    const value = raw.trim();
    if (value === "") {
      unresolvedValues.push({ owner, value: raw });
      return null;
    }

    const idMatch = byId.get(value);
    if (idMatch) return { type: "existing", id: idMatch.id };
    if (UUID.test(value)) {
      unresolvedValues.push({ owner, value });
      return null;
    }

    const alias = normalizeMerchant(value);
    if (alias === "") {
      unresolvedValues.push({ owner, value });
      return null;
    }
    const aliasMatch = byAlias.get(alias);
    if (aliasMatch) return { type: "existing", id: aliasMatch.id };

    const nameMatch = byName.get(value.toLocaleLowerCase());
    if (nameMatch) return { type: "existing", id: nameMatch.id };

    if (!creates.has(alias)) creates.set(alias, { key: alias, name: value, alias });
    return { type: "create", key: alias };
  };

  const desiredClaims = new Map<
    string,
    { payee: PayeeRef; commitments: CommitmentRef[] }
  >();

  for (const commitment of input.commitments) {
    for (const matcher of commitment.matchers) {
      const payee = resolve(matcher, `${commitment.kind} "${commitment.name}"`);
      if (!payee) continue;
      const key = refKey(payee);
      const desired = desiredClaims.get(key) ?? { payee, commitments: [] };
      if (!desired.commitments.some((entry) => sameCommitment(entry, commitment))) {
        desired.commitments.push(commitmentRef(commitment));
      }
      desiredClaims.set(key, desired);
    }
  }

  const conflicts: CutoverConflict[] = [];
  const completeClaims: ClaimAssignment[] = [];
  const claims: ClaimAssignment[] = [];
  for (const desired of desiredClaims.values()) {
    const existing =
      desired.payee.type === "existing" ? byId.get(desired.payee.id)?.claim : null;
    const commitments = [...desired.commitments];
    if (existing && !commitments.some((entry) => sameCommitment(entry, existing))) {
      commitments.push({ ...existing, name: "Existing claim" });
    }
    if (commitments.length > 1) {
      conflicts.push({ payee: desired.payee, commitments });
      continue;
    }

    const commitment = commitments[0];
    completeClaims.push({ payee: desired.payee, commitment });
    if (!existing || !sameCommitment(existing, commitment)) {
      claims.push({ payee: desired.payee, commitment });
    }
  }

  const knownCommitments = new Set(
    input.commitments.map((commitment) => `${commitment.kind}:${commitment.id}`),
  );
  const releases: ClaimRelease[] = [];
  for (const payee of input.payees) {
    if (!payee.claim) continue;
    const claimKey = `${payee.claim.kind}:${payee.claim.id}`;
    if (!knownCommitments.has(claimKey)) continue;
    const desired = desiredClaims.get(`existing:${payee.id}`);
    if (
      desired?.commitments.some((commitment) =>
        sameCommitment(commitment, payee.claim as Omit<CommitmentRef, "name">),
      )
    ) {
      continue;
    }
    releases.push({ payeeId: payee.id, commitment: payee.claim });
  }

  const malformedSchedules: PayeeCutoverPlan["malformedSchedules"] = [];
  const scheduleUpdates: ScheduleUpdate[] = [];
  for (const schedule of input.schedules) {
    const parsed = parseLegacyConditions(schedule.conditions);
    if (!parsed) {
      malformedSchedules.push({ id: schedule.id, name: schedule.name });
      continue;
    }

    let changed = false;
    const conditions = parsed.map((condition): ScheduleCondition => {
      if (condition.field !== "payee") return condition;
      const next: string[] = [];
      for (const value of conditionValues(condition)) {
        const payee = resolve(value, `schedule "${schedule.name}"`);
        if (!payee) continue;
        const resolved =
          payee.type === "existing" ? payee.id : `placeholder:${payee.key}`;
        if (!next.includes(resolved)) next.push(resolved);
      }
      if (!sameStringSet(conditionValues(condition), next)) changed = true;
      return condition.op === "is"
        ? { field: "payee", op: "is", value: next[0] ?? condition.value }
        : { field: "payee", op: "oneOf", value: next };
    });

    if (changed) {
      scheduleUpdates.push({ id: schedule.id, name: schedule.name, conditions });
    }
  }

  const claimedCommitmentByPayee = new Map<string, CommitmentRef>();
  for (const desired of desiredClaims.values()) {
    if (desired.commitments.length !== 1) continue;
    claimedCommitmentByPayee.set(refKey(desired.payee), desired.commitments[0]);
  }

  const parityDifferences: ParityDifference[] = [];
  for (const commitment of input.commitments) {
    const legacyMatchers = new Set(commitment.matchers);
    const legacyTransactionIds = sortedUnique(
      input.transactions
        .filter((row) => legacyMatchers.has(row.legacyMerchant))
        .map((row) => row.id),
    );
    const payeeTransactionIds = sortedUnique(
      input.transactions
        .filter((row) => {
          if (!row.payeeId) return false;
          const claim = claimedCommitmentByPayee.get(`existing:${row.payeeId}`);
          return claim ? sameCommitment(claim, commitment) : false;
        })
        .map((row) => row.id),
    );
    if (!sameStringSet(legacyTransactionIds, payeeTransactionIds)) {
      const legacyIds = new Set(legacyTransactionIds);
      const payeeIds = new Set(payeeTransactionIds);
      parityDifferences.push({
        commitment: commitmentRef(commitment),
        legacyTransactionIds,
        payeeTransactionIds,
        legacyOnly: input.transactions.filter(
          (row) => legacyIds.has(row.id) && !payeeIds.has(row.id),
        ),
        payeeOnly: input.transactions.filter(
          (row) => payeeIds.has(row.id) && !legacyIds.has(row.id),
        ),
      });
    }
  }

  const acceptedParityCorrections = parityDifferences.filter(
    isAcceptedParityCorrection,
  );
  const blockingParityDifferences = parityDifferences.filter(
    (difference) => !isAcceptedParityCorrection(difference),
  );
  const canApply =
    conflicts.length === 0 &&
    malformedSchedules.length === 0 &&
    unresolvedValues.length === 0 &&
    blockingParityDifferences.length === 0;

  const createRows = [...creates.values()].sort((a, b) => a.key.localeCompare(b.key));
  return {
    creates: createRows,
    desiredClaims: completeClaims,
    claims,
    releases,
    scheduleUpdates,
    conflicts,
    malformedSchedules,
    unresolvedValues,
    parityDifferences,
    acceptedParityCorrections,
    blockingParityDifferences,
    canApply,
    isIdempotent:
      canApply &&
      createRows.length === 0 &&
      claims.length === 0 &&
      releases.length === 0 &&
      scheduleUpdates.length === 0,
  };
}
