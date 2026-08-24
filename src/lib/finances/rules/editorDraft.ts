import type { RuleAction } from "./actions";

export type RuleDraftCondition = {
  field: string;
  op: string;
  value: string;
  upperValue: string;
  flags: string;
};

export type RuleDraftAction = {
  kind: "category" | "flow" | "name-payee" | "tag";
  value: string;
};

export type RuleDraft = {
  name: string;
  conditions: RuleDraftCondition[];
  actions: RuleDraftAction[];
  enabled: boolean;
  notes: string;
};

export function blankCondition(): RuleDraftCondition {
  return { field: "merchant", op: "matches", value: "", upperValue: "", flags: "" };
}

export function draftConditions(stored: unknown): RuleDraftCondition[] {
  if (!Array.isArray(stored)) return [blankCondition()];

  return stored.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const field = typeof record.field === "string" ? record.field : "merchant";
    const op = typeof record.op === "string" ? record.op : "matches";
    const value = record.value;
    let first = "";
    let second = "";
    let flags = "";

    if (typeof value === "string") first = value;
    else if (Array.isArray(value)) first = value.join(", ");
    else if (typeof value === "number") first = centsToDollars(value);
    else if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (typeof object.source === "string") first = object.source;
      if (typeof object.flags === "string") flags = object.flags;
      if (typeof object.num1 === "number") first = centsToDollars(object.num1);
      if (typeof object.num2 === "number") second = centsToDollars(object.num2);
      if (typeof object.date1 === "string") first = object.date1;
      if (typeof object.date2 === "string") second = object.date2;
    }

    return { field, op, value: first, upperValue: second, flags };
  });
}

export function draftActions(stored: unknown): RuleDraftAction[] {
  if (!Array.isArray(stored)) return [{ kind: "category", value: "" }];
  const drafts: RuleDraftAction[] = [];
  for (const entry of stored) {
    const action = (entry ?? {}) as Record<string, unknown>;
    const value = typeof action.value === "string" ? action.value : "";
    if (action.op === "name-payee") drafts.push({ kind: "name-payee", value });
    else if (action.op === "add-tag") drafts.push({ kind: "tag", value });
    else if (action.field === "category") drafts.push({ kind: "category", value });
    else if (action.field === "flow") drafts.push({ kind: "flow", value });
  }
  return drafts.length > 0 ? drafts : [{ kind: "category", value: "" }];
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | string {
  const trimmed = value.trim();
  if (trimmed === "") return trimmed;
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? Math.round(amount * 100) : trimmed;
}

function list(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function storedConditions(drafts: readonly RuleDraftCondition[]): unknown[] {
  return drafts.map((draft) => {
    const value = draft.value.trim();
    if (draft.field === "amount") {
      return draft.op === "isbetween"
        ? {
            field: draft.field,
            op: draft.op,
            value: {
              num1: dollarsToCents(value),
              num2: dollarsToCents(draft.upperValue),
            },
          }
        : { field: draft.field, op: draft.op, value: dollarsToCents(value) };
    }
    if (draft.field === "date" && draft.op === "isbetween") {
      return {
        field: draft.field,
        op: draft.op,
        value: { date1: value, date2: draft.upperValue.trim() },
      };
    }
    if (
      (draft.field === "merchant" || draft.field === "description") &&
      draft.op === "matches"
    ) {
      return {
        field: draft.field,
        op: draft.op,
        value: { source: value, flags: draft.flags },
      };
    }
    if (draft.op === "oneOf") {
      return { field: draft.field, op: draft.op, value: list(value) };
    }
    return { field: draft.field, op: draft.op, value };
  });
}

export function storedActions(drafts: readonly RuleDraftAction[]): RuleAction[] {
  return drafts
    .filter((draft) => draft.value.trim() !== "")
    .map((draft) =>
      draft.kind === "name-payee"
        ? { op: "name-payee" as const, value: draft.value.trim() }
        : draft.kind === "tag"
          ? { op: "add-tag" as const, value: draft.value.trim().replace(/^#/, "") }
          : { op: "set" as const, field: draft.kind, value: draft.value.trim() },
    ) as RuleAction[];
}
