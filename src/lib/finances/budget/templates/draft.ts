/**
 * The editable form of a template line, and the round trip to and from the stored shape.
 *
 * The drawer cannot edit `Template` directly: a money field is empty for a moment while it is
 * being typed, and `Template` has no representation for "not a number yet" — parsing on every
 * keystroke would either throw or silently drop the line. So the editor holds strings, and this
 * module owns the two conversions plus the validation message the user sees.
 *
 * It lives here rather than in the component because the awkward cases are reasoning, not
 * chrome: a simple line needs a monthly amount *or* a limit, a `by` line's month must be real,
 * and every amount has to land on integer cents (`types.ts` asserts it further down).
 *
 * Spec: `agent-os/specs/2026-08-22-2242-budget-goal-templates/` D1.
 */

import { parseAmountCents } from "@/lib/finances/money";
import type { MonthKey } from "../envelope";
import {
  newTemplateId,
  type ByTemplate,
  type SimpleTemplate,
  type Template,
  type TemplateType,
} from "./types";

export type SimpleDraft = {
  id: string;
  type: "simple";
  /** Dollars as typed. Blank means "no monthly amount" — the refill case. */
  monthly: string;
  /** Dollars as typed. Blank means "no limit". */
  limit: string;
  hold: boolean;
};

export type ScheduleDraft = {
  id: string;
  type: "schedule";
  scheduleId: string;
  full: boolean;
};

export type ByDraft = {
  id: string;
  type: "by";
  amount: string;
  /** `YYYY-MM`. */
  month: string;
  /** Blank means one-shot. */
  repeat: string;
  annual: boolean;
};

export type RemainderDraft = {
  id: string;
  type: "remainder";
  weight: string;
};

export type Draft = SimpleDraft | ScheduleDraft | ByDraft | RemainderDraft;

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function draftsFromTemplates(templates: readonly Template[]): Draft[] {
  return templates.map((template): Draft => {
    switch (template.type) {
      case "simple":
        return {
          id: template.id,
          type: "simple",
          monthly:
            template.monthlyCents === undefined ? "" : dollars(template.monthlyCents),
          limit: template.limit ? dollars(template.limit.amountCents) : "",
          hold: template.limit?.hold ?? false,
        };
      case "schedule":
        return {
          id: template.id,
          type: "schedule",
          scheduleId: template.scheduleId,
          full: template.full ?? false,
        };
      case "by":
        return {
          id: template.id,
          type: "by",
          amount: dollars(template.amountCents),
          month: template.month,
          repeat: template.repeat === undefined ? "" : String(template.repeat),
          annual: template.annual ?? false,
        };
      case "remainder":
        return { id: template.id, type: "remainder", weight: String(template.weight) };
    }
  });
}

/**
 * A blank line of the given type.
 *
 * `by` defaults to December of the current budget month's year — a savings target is nearly
 * always further out than next month, and a default that is already in the past would make the
 * first preview read as a bug.
 */
export function newDraft(type: TemplateType, month: MonthKey): Draft {
  const id = newTemplateId();
  switch (type) {
    case "simple":
      return { id, type: "simple", monthly: "", limit: "", hold: false };
    case "schedule":
      return { id, type: "schedule", scheduleId: "", full: false };
    case "by":
      return {
        id,
        type: "by",
        amount: "",
        month: `${month.slice(0, 4)}-12`,
        repeat: "",
        annual: false,
      };
    case "remainder":
      return { id, type: "remainder", weight: "1" };
  }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export type DraftResult =
  { ok: true; templates: Template[] } | { ok: false; error: string };

function money(raw: string, what: string): number | string {
  const cents = parseAmountCents(raw);
  if (cents === null) return `${what} is not an amount.`;
  if (cents <= 0) return `${what} must be more than zero.`;
  return cents;
}

function count(raw: string, what: string): number | string {
  if (!/^\d+$/.test(raw.trim())) return `${what} must be a whole number.`;
  const value = Number(raw.trim());
  if (value < 1) return `${what} must be at least 1.`;
  return value;
}

function convert(draft: Draft): Template | string {
  switch (draft.type) {
    case "simple": {
      const hasMonthly = draft.monthly.trim() !== "";
      const hasLimit = draft.limit.trim() !== "";
      if (!hasMonthly && !hasLimit) {
        return "A monthly line needs an amount, a limit, or both.";
      }
      const template: SimpleTemplate = {
        id: draft.id,
        directive: "template",
        type: "simple",
        priority: 0,
      };
      if (hasMonthly) {
        const cents = money(draft.monthly, "The monthly amount");
        if (typeof cents === "string") return cents;
        template.monthlyCents = cents;
      }
      if (hasLimit) {
        const cents = money(draft.limit, "The limit");
        if (typeof cents === "string") return cents;
        template.limit = { amountCents: cents, hold: draft.hold };
      }
      return template;
    }
    case "schedule": {
      if (draft.scheduleId === "") return "Pick a schedule for the schedule line.";
      return {
        id: draft.id,
        directive: "template",
        type: "schedule",
        priority: 0,
        scheduleId: draft.scheduleId,
        ...(draft.full ? { full: true } : {}),
      };
    }
    case "by": {
      const cents = money(draft.amount, "The target amount");
      if (typeof cents === "string") return cents;
      if (!MONTH.test(draft.month)) return "The target month must be a real month.";
      const template: ByTemplate = {
        id: draft.id,
        directive: "template",
        type: "by",
        priority: 0,
        amountCents: cents,
        month: draft.month,
      };
      if (draft.repeat.trim() !== "") {
        const repeat = count(draft.repeat, "The repeat");
        if (typeof repeat === "string") return repeat;
        template.repeat = repeat;
        if (draft.annual) template.annual = true;
      }
      return template;
    }
    case "remainder": {
      const weight = count(draft.weight, "The weight");
      if (typeof weight === "string") return weight;
      return {
        id: draft.id,
        directive: "template",
        type: "remainder",
        priority: null,
        weight,
      };
    }
  }
}

export function draftsToTemplates(drafts: readonly Draft[]): DraftResult {
  const templates: Template[] = [];
  for (const draft of drafts) {
    const converted = convert(draft);
    if (typeof converted === "string") return { ok: false, error: converted };
    templates.push(converted);
  }
  if (templates.filter((template) => template.type === "remainder").length > 1) {
    return {
      ok: false,
      error: "One remainder line per envelope — raise its weight instead.",
    };
  }
  return { ok: true, templates };
}
