/**
 * What an audit change must hold for its deleted row to be put back.
 *
 * Pure, so the rules for "is this restorable" are testable without a database
 * (`agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/` D4). Only a
 * **pending hold** is restorable: a posted row is history a feed or statement owns, and
 * re-inserting one beside its own re-delivery is exactly the duplicate this app keeps
 * fighting. The write side (`auditRestoreWrite.ts`) adds the checks that need the database.
 */
import { parseBankBrowserSnapshot } from "./bankSnapshot";
import { financeFlowKindEnum, type FinanceFlowKind } from "@/db/schema";
import { numericStringToCents } from "./money";

export type RestorableHold = {
  accountId: string;
  transactionDate: string;
  postedDate: string | null;
  description: string;
  amountCents: number;
  notes: string;
  sourceCategory: string;
  budgetCategoryId: string | null;
  payeeId: string | null;
  derivedFlow: FinanceFlowKind | null;
  flowOverride: FinanceFlowKind | null;
  transferGroupId: string | null;
  externalSource: string | null;
  externalId: string | null;
};

export type RestoreVerdict =
  { ok: true; hold: RestorableHold } | { ok: false; reason: string };

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function flow(value: unknown): FinanceFlowKind | null {
  return (financeFlowKindEnum.enumValues as readonly string[]).includes(String(value))
    ? (value as FinanceFlowKind)
    : null;
}

/**
 * A snapshot audit written before the restore existed recorded no description or notes.
 * The pastes that listed the hold while it was alive still name it — the deleting paste
 * usually does not, since a hold is deleted precisely when the page stops listing it. The
 * amount and day pick it out, and only when exactly one row does in a paste: never a guess
 * between two.
 */
function descriptionFromEvidence(
  before: Record<string, unknown>,
  evidence: readonly Record<string, unknown>[],
): string | null {
  for (const item of evidence) {
    const raw = item.rawText;
    if (typeof raw !== "string") continue;
    const parsed = parseBankBrowserSnapshot(raw);
    if (!parsed.ok) continue;
    const matches = parsed.snapshot.pending.filter(
      (row) =>
        row.amountCents === before.amountCents &&
        row.transactionDate === before.transactionDate,
    );
    if (matches.length === 1) return matches[0].description;
  }
  return null;
}

/** Decide whether a deleted transaction's audit `before` can be re-inserted, and as what. */
export function restorableHold(
  change: {
    entityType: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  },
  /** Source evidence of every audit event that touched this row, newest first. */
  evidence: readonly Record<string, unknown>[],
): RestoreVerdict {
  const { before } = change;
  if (change.entityType !== "transaction" || !before || change.after !== null) {
    return { ok: false, reason: "That change is not a deleted transaction." };
  }
  if (before.pending !== true) {
    return {
      ok: false,
      reason:
        "Only a pending hold can be restored. A posted row is history its feed delivers.",
    };
  }
  if (before.isParent === true || before.parentId) {
    return { ok: false, reason: "A split transaction cannot be restored from here." };
  }
  // Bank-snapshot audits record `amountCents`; the register's records the column's string.
  const amountCents =
    typeof before.amountCents === "number"
      ? before.amountCents
      : typeof before.amount === "string"
        ? numericStringToCents(before.amount)
        : null;
  const accountId = text(before.accountId);
  const transactionDate = text(before.transactionDate);
  if (
    !accountId ||
    !transactionDate ||
    amountCents === null ||
    !Number.isInteger(amountCents)
  ) {
    return { ok: false, reason: "This audit record does not hold the whole row." };
  }
  const description =
    text(before.description) ?? descriptionFromEvidence(before, evidence);
  if (!description) {
    return {
      ok: false,
      reason: "This audit record does not say what the hold was called.",
    };
  }
  return {
    ok: true,
    hold: {
      accountId,
      transactionDate,
      postedDate: text(before.postedDate),
      description,
      amountCents,
      notes: typeof before.notes === "string" ? before.notes : "",
      sourceCategory:
        typeof before.sourceCategory === "string" ? before.sourceCategory : "",
      budgetCategoryId: text(before.budgetCategoryId),
      payeeId: text(before.payeeId),
      derivedFlow: flow(before.derivedFlow),
      flowOverride: flow(before.flowOverride),
      transferGroupId: text(before.transferGroupId),
      externalSource: text(before.externalSource),
      externalId: text(before.externalId),
    },
  };
}
