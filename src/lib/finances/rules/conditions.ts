/**
 * Rule conditions in Actual's `{field, op, value}` shape — the generic set.
 *
 * `schedules/conditions.ts` is the same contract restricted to the four schedule fields, and
 * its header says outright that it is not the generic rule engine. This is that engine's parse.
 * The amount helpers are imported from there rather than rewritten, because two implementations
 * of "within 7.5%" would eventually disagree about a bill.
 *
 * **Reimplemented from Actual Budget** — `CONDITION_TYPES` in
 * `../actual/packages/loot-core/src/server/rules/condition.ts` (MIT, © James Long).
 * Spec: `agent-os/specs/2026-08-23-1536-finance-rules/` D3.
 *
 * **`merchant` and `description` are two fields, not one with a flag.** `merchant` tests
 * `normalizeMerchant(description)` — uppercase, store number and processor stamp already
 * stripped — and every one of the 65 seeded patterns is anchored to that string. The same
 * `^GITHUB` against a raw bank line would miss `PAYPAL *GITHUB INC`, which is precisely the
 * row it exists to claim. Collapsing them into one field with a "match the raw text" toggle
 * would make that difference invisible at the moment someone writes a pattern.
 *
 * Amount values are **signed integer cents, positive is money in**, matching
 * `finance_transactions`. A $50 charge is `-5000`.
 *
 * **Parsing is all-or-nothing**, like the schedule parse: one bad entry rejects the list. A
 * partially-applied rule is worse than a refused one, because it would silently claim a
 * different set of rows than the one written down.
 */

import { amountMatches, type AmountCondition } from "../schedules/conditions";

export type TextField = "merchant" | "description";
export type TextOp = "is" | "contains" | "startsWith" | "oneOf" | "matches";

/**
 * A stored regex, source and flags apart.
 *
 * Never a serialized `/…/` string: parsing one back out means finding the last slash, and a
 * pattern containing a slash then loses its tail silently.
 */
export type StoredRegex = { source: string; flags: string };

export type TextCondition =
  | { field: TextField; op: "is" | "contains" | "startsWith"; value: string }
  | { field: TextField; op: "oneOf"; value: string[] }
  | { field: TextField; op: "matches"; value: StoredRegex };

export type PayeeCondition =
  | { field: "payee"; op: "is"; value: string }
  | { field: "payee"; op: "oneOf"; value: string[] };

export type AccountCondition =
  | { field: "account"; op: "is"; value: string }
  | { field: "account"; op: "oneOf"; value: string[] };

export type RuleAmountCondition = { field: "amount" } & AmountCondition;

export type DateCondition =
  | { field: "date"; op: "is" | "gt" | "gte" | "lt" | "lte"; value: string }
  | { field: "date"; op: "isbetween"; value: { date1: string; date2: string } };

export type RuleCondition =
  | TextCondition
  | PayeeCondition
  | AccountCondition
  | RuleAmountCondition
  | DateCondition;

/** A condition with its regex already built, so a pass never compiles anything. */
export type CompiledCondition =
  | Exclude<RuleCondition, { op: "matches" }>
  | { field: TextField; op: "matches"; value: StoredRegex; regex: RegExp };

const TEXT_FIELDS = new Set<string>(["merchant", "description"]);
const TEXT_OPS = new Set<string>(["is", "contains", "startsWith", "oneOf", "matches"]);
const DATE_OPS = new Set<string>(["is", "gt", "gte", "lt", "lte"]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * How long a pattern may be.
 *
 * Not a safety boundary on its own — see `regexRisk` — but a cheap ceiling on how much work a
 * single condition can ask for, and far above anything the seeded corpus needs (its longest is
 * well under a hundred characters).
 */
export const MAX_REGEX_SOURCE = 200;

/**
 * Flags a rule may carry.
 *
 * **`g` and `y` are refused, and this is a correctness rule rather than a style one.**
 * `RegExp.prototype.test` on a global regex advances `lastIndex` and resumes from there on the
 * next call. A rule compiled once and tested down 7,030 rows would therefore answer yes, no,
 * yes, no — correct in the editor, where it is tried against one string, and wrong in the
 * register. Compiling per row would hide it again at the cost of the performance the compile
 * step exists for. Refusing the flag is the only version that is right in both places.
 *
 * `i` is allowed and does nothing for `merchant`, whose input is already uppercase; it is
 * there for `description`, which is raw.
 */
const ALLOWED_FLAGS = new Set(["", "i"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => isNonEmptyString(entry))
  );
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value);
}

function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Reject a pattern whose backtracking can blow up.
 *
 * A quantified group whose body is itself quantified — `(a+)+`, `(\w+\s?)*` — takes
 * exponential time on a failing input, and the inputs here come from bank feeds rather than
 * from the person who wrote the pattern. `merchant` values are short, which bounds the damage
 * but does not remove it: `(a+)+b` against forty characters is still 2^40.
 *
 * Deliberately conservative and deliberately syntactic. A real analysis would need the parse
 * tree; this catches the shape people actually type, and a false refusal costs one rewrite of
 * a pattern while a false accept costs a hung reclassify.
 */
export function regexRisk(source: string): string | null {
  // A group that is quantified, containing a quantifier at any depth inside it.
  const nested = /\((?:\?[:=!<][^)]*|[^)]*)[*+?}][^)]*\)\s*[*+]/;
  if (nested.test(source)) {
    return "That pattern nests one repeat inside another, which can take exponential time to fail. Simplify it.";
  }
  // `(a|aa)*` — alternatives with the same prefix can partition one input exponentially.
  for (const match of source.matchAll(/\((?:\?:)?([^()]*)\)\s*[*+]/g)) {
    const branches = match[1].split("|");
    if (
      branches.length > 1 &&
      branches.some((left, at) =>
        branches.some(
          (right, other) =>
            at !== other && (left.startsWith(right) || right.startsWith(left)),
        ),
      )
    ) {
      return "That pattern repeats overlapping alternatives, which can take exponential time to fail. Simplify it.";
    }
  }
  return null;
}

/**
 * Build the regex, or say why not.
 *
 * Returns a message rather than throwing so the drawer can show it beside the field, and so a
 * malformed row already in the table is reported by `compileRules` instead of taking down
 * every page that classifies a transaction.
 */
export function compileStoredRegex(
  value: unknown,
): { regex: RegExp; stored: StoredRegex } | { error: string } {
  if (!isRecord(value) || !isNonEmptyString(value.source)) {
    return { error: "A pattern needs something to match." };
  }
  const flags = typeof value.flags === "string" ? value.flags : "";
  if (!ALLOWED_FLAGS.has(flags)) {
    return {
      error: `The only pattern flag allowed is "i". A global pattern would give different answers to the same row depending on what was tested before it.`,
    };
  }
  if (value.source.length > MAX_REGEX_SOURCE) {
    return { error: `A pattern may be at most ${MAX_REGEX_SOURCE} characters.` };
  }
  const risk = regexRisk(value.source);
  if (risk) return { error: risk };

  try {
    return {
      regex: new RegExp(value.source, flags),
      stored: { source: value.source, flags },
    };
  } catch {
    return { error: "That is not a valid pattern." };
  }
}

function parseTextCondition(
  field: TextField,
  op: string,
  value: unknown,
): CompiledCondition | null {
  if (op === "oneOf") {
    return isStringList(value) ? { field, op, value } : null;
  }
  if (op === "matches") {
    const built = compileStoredRegex(value);
    if ("error" in built) return null;
    return { field, op, value: built.stored, regex: built.regex };
  }
  if (op !== "is" && op !== "contains" && op !== "startsWith") return null;
  // An empty needle would claim every row, which is never what someone meant to write.
  return isNonEmptyString(value) ? { field, op, value } : null;
}

function parseIdCondition(
  field: "payee" | "account",
  op: string,
  value: unknown,
): CompiledCondition | null {
  if (op === "is") {
    return typeof value === "string" && UUID.test(value) ? { field, op, value } : null;
  }
  if (op === "oneOf") {
    return isStringList(value) && value.every((entry) => UUID.test(entry))
      ? { field, op, value }
      : null;
  }
  return null;
}

function parseAmountCondition(op: string, value: unknown): CompiledCondition | null {
  if (op === "is" || op === "isapprox") {
    return isCents(value) ? { field: "amount", op, value } : null;
  }
  if (op === "isbetween") {
    if (!isRecord(value) || !isCents(value.num1) || !isCents(value.num2)) return null;
    return { field: "amount", op, value: { num1: value.num1, num2: value.num2 } };
  }
  if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
    // Actual's amount comparison ops, expressed through `isbetween` so one matcher covers
    // every amount condition. An open end is the extreme of the signed-cents range.
    if (!isCents(value)) return null;
    const bound = Number.MAX_SAFE_INTEGER;
    const range =
      op === "gt"
        ? { num1: value + 1, num2: bound }
        : op === "gte"
          ? { num1: value, num2: bound }
          : op === "lt"
            ? { num1: -bound, num2: value - 1 }
            : { num1: -bound, num2: value };
    return { field: "amount", op: "isbetween", value: range };
  }
  return null;
}

function parseDateCondition(op: string, value: unknown): CompiledCondition | null {
  if (DATE_OPS.has(op)) {
    return isDateKey(value)
      ? { field: "date", op: op as "is" | "gt" | "gte" | "lt" | "lte", value }
      : null;
  }
  if (op === "isbetween") {
    if (!isRecord(value) || !isDateKey(value.date1) || !isDateKey(value.date2))
      return null;
    return { field: "date", op, value: { date1: value.date1, date2: value.date2 } };
  }
  return null;
}

function parseOne(raw: unknown): CompiledCondition | null {
  if (!isRecord(raw)) return null;
  const { field, op, value } = raw;
  if (typeof field !== "string" || typeof op !== "string") return null;

  if (TEXT_FIELDS.has(field)) {
    return TEXT_OPS.has(op) ? parseTextCondition(field as TextField, op, value) : null;
  }
  if (field === "payee" || field === "account")
    return parseIdCondition(field, op, value);
  if (field === "amount") return parseAmountCondition(op, value);
  if (field === "date") return parseDateCondition(op, value);
  return null;
}

/**
 * Parse and compile a whole conditions blob, or return null.
 *
 * **An empty list is invalid.** A rule with nothing to match would claim every transaction,
 * which is the one mistake whose blast radius is the entire history — and it is what a
 * half-finished rule looks like, so it must not be storable.
 */
export function parseRuleConditions(raw: unknown): CompiledCondition[] | null {
  const result = parseRuleConditionsDetailed(raw);
  return "conditions" in result ? result.conditions : null;
}

export function parseRuleConditionsDetailed(
  raw: unknown,
): { conditions: CompiledCondition[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Rule conditions need at least one entry." };
  }

  const parsed: CompiledCondition[] = [];
  for (const [index, entry] of raw.entries()) {
    const condition = parseOne(entry);
    if (!condition) {
      if (
        isRecord(entry) &&
        entry.op === "matches" &&
        (entry.field === "merchant" || entry.field === "description")
      ) {
        const regex = compileStoredRegex(entry.value);
        if ("error" in regex) return { error: regex.error };
      }
      return { error: `Condition ${index + 1} is not valid.` };
    }
    parsed.push(condition);
  }
  return { conditions: parsed };
}

/** Strip the compiled regex back off, for storage. */
export function toStoredConditions(
  conditions: readonly CompiledCondition[],
): RuleCondition[] {
  return conditions.map((condition) =>
    "regex" in condition
      ? { field: condition.field, op: condition.op, value: condition.value }
      : condition,
  );
}

/** The row fields a condition can ask about. */
export type RuleRowInput = {
  /** `normalizeMerchant(description)` — already uppercase. */
  merchant: string;
  /** The raw bank line. */
  description: string;
  payeeId: string | null;
  accountId: string;
  /** Signed cents, positive is money in. */
  amountCents: number;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
};

function textOf(field: TextField, row: RuleRowInput): string {
  return field === "merchant" ? row.merchant : row.description;
}

/** Whether one condition holds for one row. */
export function conditionMatches(
  condition: CompiledCondition,
  row: RuleRowInput,
): boolean {
  switch (condition.field) {
    case "merchant":
    case "description": {
      const text = textOf(condition.field, row);
      if (condition.op === "matches") return condition.regex.test(text);
      if (condition.op === "is") return text === condition.value;
      if (condition.op === "contains") return text.includes(condition.value);
      if (condition.op === "startsWith") return text.startsWith(condition.value);
      return condition.value.includes(text);
    }
    case "payee":
      // Null is not an identity: an unclaimed row matches no payee condition, rather than
      // matching every rule that names a payee it happens not to have.
      if (row.payeeId === null) return false;
      return condition.op === "is"
        ? row.payeeId === condition.value
        : condition.value.includes(row.payeeId);
    case "account":
      return condition.op === "is"
        ? row.accountId === condition.value
        : condition.value.includes(row.accountId);
    case "amount":
      return amountMatches(condition, row.amountCents);
    case "date": {
      // Calendar days compare as strings. `YYYY-MM-DD` sorts lexicographically the way it
      // sorts chronologically, and `dates.md` forbids turning a calendar field into an
      // instant to compare it.
      const day = row.transactionDate;
      if (condition.op === "isbetween") {
        const lo =
          condition.value.date1 <= condition.value.date2
            ? condition.value.date1
            : condition.value.date2;
        const hi =
          condition.value.date1 <= condition.value.date2
            ? condition.value.date2
            : condition.value.date1;
        return day >= lo && day <= hi;
      }
      if (condition.op === "is") return day === condition.value;
      if (condition.op === "gt") return day > condition.value;
      if (condition.op === "gte") return day >= condition.value;
      if (condition.op === "lt") return day < condition.value;
      return day <= condition.value;
    }
  }
}
