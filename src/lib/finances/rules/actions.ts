/**
 * What a rule is allowed to do.
 *
 * Three actions, against Actual's six (`../actual/packages/loot-core/src/server/rules/action.ts`,
 * MIT): set a taxonomy category, set a flow, and name a payee at mint time. `set-split-amount`,
 * `link-schedule`, `prepend-notes`, `append-notes` and `delete-transaction` are refused by name
 * rather than merely unhandled, so a reader can see they were considered and why they are out:
 * this app has no split transactions, schedules are linked from the other side, and nothing
 * should be able to delete money as a side effect of a categorisation pass.
 *
 * **`name-payee` is where `ClassifyRule.merchant` went.** The knowledge that `WM SUPERCENTER`
 * and `WAL-MART` are one company is a fact about the world, not about the string, and it used
 * to be compiled into the app. It applies **only when a payee is minted for an alias never seen
 * before** — never to an existing payee, because renaming is an operation the user owns and a
 * rule must not undo it. That is the same invariant `payees/seed.ts` already keeps: a re-run
 * cannot reverse an edit.
 *
 * Spec: `agent-os/specs/2026-08-23-1536-finance-rules/` D4.
 */

import type { FinanceFlowKind } from "@/db/schema";
import { FINANCE_CATEGORIES, type FinanceCategory } from "../classify/categories";

export type RuleAction =
  | { op: "set"; field: "category"; value: FinanceCategory }
  | { op: "set"; field: "flow"; value: FinanceFlowKind }
  | { op: "name-payee"; value: string };

/** Actual ops this app deliberately does not implement, named so the refusal is legible. */
export const REFUSED_ACTION_OPS = [
  "set-split-amount",
  "link-schedule",
  "prepend-notes",
  "append-notes",
  "delete-transaction",
] as const;

const CATEGORIES = new Set<string>(FINANCE_CATEGORIES);

const FLOWS = new Set<string>([
  "spend",
  "income",
  "refund",
  "interest_fee",
  "internal_transfer",
  "external_transfer",
]);

/**
 * Flows that carry a category.
 *
 * Mirrors `carriesCategory` in `classify/reclassify.ts`, which drops the category of any row
 * whose flow is movement rather than cost — that is how a "Transfers" slice stops being the
 * largest thing on a spending chart. A rule that set both an `internal_transfer` flow and a
 * category would therefore have half of itself silently discarded at plan time, which is worse
 * than being told at save time that the combination means nothing.
 */
const FLOWS_WITH_CATEGORY = new Set<string>(["spend", "refund", "interest_fee"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOne(raw: unknown): RuleAction | null {
  if (!isRecord(raw) || typeof raw.op !== "string") return null;

  if (raw.op === "name-payee") {
    const value = typeof raw.value === "string" ? raw.value.trim() : "";
    return value === "" ? null : { op: "name-payee", value };
  }
  if (raw.op !== "set" || typeof raw.field !== "string") return null;

  if (raw.field === "category") {
    return typeof raw.value === "string" && CATEGORIES.has(raw.value)
      ? { op: "set", field: "category", value: raw.value as FinanceCategory }
      : null;
  }
  if (raw.field === "flow") {
    return typeof raw.value === "string" && FLOWS.has(raw.value)
      ? { op: "set", field: "flow", value: raw.value as FinanceFlowKind }
      : null;
  }
  return null;
}

export type ActionParse =
  | { actions: RuleAction[] }
  | { error: string };

/**
 * Parse an actions blob, or say what is wrong with it.
 *
 * Returns a message rather than null because every refusal here is something a person can fix
 * in the drawer, and "invalid" alone would leave them guessing which of three rules they broke.
 *
 * `hasPayeeCondition` is passed in because one of those rules is about the rule as a whole:
 * naming a payee only happens when a payee is being created, so a rule that can only match rows
 * which already have one can never fire its own action.
 */
export function parseRuleActions(
  raw: unknown,
  options: { hasPayeeCondition?: boolean } = {},
): ActionParse {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "A rule needs at least one action, or it does nothing." };
  }

  const actions: RuleAction[] = [];
  for (const entry of raw) {
    if (isRecord(entry) && typeof entry.op === "string") {
      const refused = REFUSED_ACTION_OPS.find((op) => op === entry.op);
      if (refused) return { error: `Rules here cannot "${refused}".` };
    }
    const action = parseOne(entry);
    if (!action) return { error: "That is not an action a rule can take." };
    actions.push(action);
  }

  const category = actions.find(
    (action) => action.op === "set" && action.field === "category",
  );
  const flow = actions.find((action) => action.op === "set" && action.field === "flow");
  const namePayee = actions.find((action) => action.op === "name-payee");

  if (category && flow && flow.op === "set" && !FLOWS_WITH_CATEGORY.has(flow.value)) {
    return {
      error: `A ${flow.value} row carries no category, so setting both would discard the category.`,
    };
  }
  if (namePayee && options.hasPayeeCondition) {
    return {
      error:
        "A rule that matches on a payee cannot also name one — the payee has to exist before the condition can match.",
    };
  }

  const fields = actions.map((action) =>
    action.op === "set" ? action.field : action.op,
  );
  if (new Set(fields).size !== fields.length) {
    return { error: "A rule can set each thing at most once." };
  }

  return { actions };
}

/** One-line description of what a rule does, for a grid cell. */
export function summarizeActions(actions: readonly RuleAction[]): string {
  return actions
    .map((action) =>
      action.op === "name-payee"
        ? `call it ${action.value}`
        : `${action.field} = ${action.value}`,
    )
    .join(", ");
}
