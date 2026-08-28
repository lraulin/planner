/**
 * Goal-template shapes stored on an envelope.
 *
 * **Reimplemented from Actual Budget** — `packages/loot-core/src/types/models/templates.ts`
 * (MIT, © James Long). Actual stores dollar floats in `goal_def` because the notes parser
 * emits them. We store **integer cents**, asserted, matching every other money value in this
 * module. The four types and the field names otherwise follow theirs.
 *
 * Spec: `agent-os/specs/2026-08-22-2242-budget-goal-templates/` D1.
 */

import { weekdayLongLabel } from "@/lib/dateFormat";
import { formatUsd } from "@/lib/finances/money";
import { monthName } from "../envelope";

export const TEMPLATE_TYPES = ["simple", "weekly", "by", "remainder"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export type TemplateLimit = {
  amountCents: number;
  hold: boolean;
};

type Base = {
  /** Stable across edits so the drawer can delete a line without using array index. */
  id: string;
  directive: "template";
  description?: string;
};

export type SimpleTemplate = Base & {
  type: "simple";
  priority: number;
  /** Omit for the refill case: assign `limit − carry-in`. */
  monthlyCents?: number;
  limit?: TemplateLimit;
};

export type WeeklyTemplate = Base & {
  type: "weekly";
  priority: number;
  /** Per-occurrence amount; the month's ask is this times the occurrences in the month. */
  amountCents: number;
  /** 0 = Sunday … 6 = Saturday, the `weekdayOfDateKey` convention. */
  weekday: number;
};

export type ByTemplate = Base & {
  type: "by";
  priority: number;
  amountCents: number;
  /** Target month as `YYYY-MM`. */
  month: string;
  /** When true, `repeat` is years; otherwise months. */
  annual?: boolean;
  repeat?: number;
};

export type RemainderTemplate = Base & {
  type: "remainder";
  /** Remainder always runs last; Actual stores this as null. */
  priority: null;
  weight: number;
};

export type Template = SimpleTemplate | WeeklyTemplate | ByTemplate | RemainderTemplate;

const ID = /^[A-Za-z0-9_-]+$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertCents(value: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be integer cents, got ${value}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseId(value: unknown): string | null {
  return typeof value === "string" && ID.test(value) ? value : null;
}

function parsePriority(value: unknown): number | null {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function parseLimit(value: unknown): TemplateLimit | null {
  if (!isRecord(value)) return null;
  if (typeof value.amountCents !== "number" || !Number.isInteger(value.amountCents)) {
    return null;
  }
  if (typeof value.hold !== "boolean") return null;
  return { amountCents: value.amountCents, hold: value.hold };
}

function parseSimple(raw: Record<string, unknown>, id: string): SimpleTemplate | null {
  const priority = parsePriority(raw.priority);
  if (priority === null) return null;
  const template: SimpleTemplate = {
    id,
    directive: "template",
    type: "simple",
    priority,
  };
  if (raw.monthlyCents !== undefined) {
    if (typeof raw.monthlyCents !== "number" || !Number.isInteger(raw.monthlyCents)) {
      return null;
    }
    template.monthlyCents = raw.monthlyCents;
  }
  if (raw.limit !== undefined) {
    const limit = parseLimit(raw.limit);
    if (!limit) return null;
    template.limit = limit;
  }
  if (template.monthlyCents === undefined && template.limit === undefined) return null;
  if (typeof raw.description === "string") template.description = raw.description;
  return template;
}

function parseWeekly(raw: Record<string, unknown>, id: string): WeeklyTemplate | null {
  const priority = parsePriority(raw.priority);
  if (priority === null) return null;
  if (
    typeof raw.amountCents !== "number" ||
    !Number.isInteger(raw.amountCents) ||
    raw.amountCents <= 0
  ) {
    return null;
  }
  if (
    typeof raw.weekday !== "number" ||
    !Number.isInteger(raw.weekday) ||
    raw.weekday < 0 ||
    raw.weekday > 6
  ) {
    return null;
  }
  const template: WeeklyTemplate = {
    id,
    directive: "template",
    type: "weekly",
    priority,
    amountCents: raw.amountCents,
    weekday: raw.weekday,
  };
  if (typeof raw.description === "string") template.description = raw.description;
  return template;
}

function parseBy(raw: Record<string, unknown>, id: string): ByTemplate | null {
  const priority = parsePriority(raw.priority);
  if (priority === null) return null;
  if (typeof raw.amountCents !== "number" || !Number.isInteger(raw.amountCents))
    return null;
  if (typeof raw.month !== "string" || !MONTH.test(raw.month)) return null;
  const template: ByTemplate = {
    id,
    directive: "template",
    type: "by",
    priority,
    amountCents: raw.amountCents,
    month: raw.month,
  };
  if (raw.annual !== undefined) {
    if (typeof raw.annual !== "boolean") return null;
    template.annual = raw.annual;
  }
  if (raw.repeat !== undefined) {
    if (
      typeof raw.repeat !== "number" ||
      !Number.isInteger(raw.repeat) ||
      raw.repeat < 1
    ) {
      return null;
    }
    template.repeat = raw.repeat;
  }
  if (typeof raw.description === "string") template.description = raw.description;
  return template;
}

function parseRemainder(
  raw: Record<string, unknown>,
  id: string,
): RemainderTemplate | null {
  if (raw.priority !== null && raw.priority !== undefined) return null;
  const weight =
    raw.weight === undefined
      ? 1
      : typeof raw.weight === "number" && Number.isInteger(raw.weight) && raw.weight > 0
        ? raw.weight
        : null;
  if (weight === null) return null;
  const template: RemainderTemplate = {
    id,
    directive: "template",
    type: "remainder",
    priority: null,
    weight,
  };
  if (typeof raw.description === "string") template.description = raw.description;
  return template;
}

function parseOne(raw: unknown): Template | null {
  if (!isRecord(raw) || raw.directive !== "template") return null;
  const id = parseId(raw.id);
  if (!id) return null;
  switch (raw.type) {
    case "simple":
      return parseSimple(raw, id);
    case "weekly":
      return parseWeekly(raw, id);
    case "by":
      return parseBy(raw, id);
    case "remainder":
      return parseRemainder(raw, id);
    default:
      return null;
  }
}

/**
 * Parse stored JSONB. Returns null when the blob is not a usable list — callers must not
 * pass garbage to the apply engine.
 */
export function parseTemplates(raw: unknown): Template[] | null {
  if (!Array.isArray(raw)) return null;
  const parsed: Template[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const template = parseOne(entry);
    if (!template) return null;
    if (seen.has(template.id)) return null;
    seen.add(template.id);
    parsed.push(template);
  }
  return parsed;
}

export function parseTemplatesOrThrow(raw: unknown): Template[] {
  const parsed = parseTemplates(raw);
  if (!parsed) throw new Error("Those templates are not valid.");
  return parsed;
}

/** One-line summary for the editor list. */
export function summarize(template: Template): string {
  switch (template.type) {
    case "simple": {
      const monthly =
        template.monthlyCents !== undefined
          ? `${formatUsd(template.monthlyCents)}/mo`
          : null;
      const limit = template.limit
        ? `up to ${formatUsd(template.limit.amountCents)}${template.limit.hold ? " hold" : ""}`
        : null;
      return [monthly, limit].filter(Boolean).join(" ") || "simple";
    }
    case "weekly":
      return `${formatUsd(template.amountCents)} each ${weekdayLongLabel(template.weekday)}`;
    case "by": {
      const year = template.month.slice(0, 4);
      const when = `${monthName(`${template.month}-01`)} ${year}`;
      const repeat = template.repeat
        ? template.annual
          ? ` every ${template.repeat === 1 ? "year" : `${template.repeat} years`}`
          : ` every ${template.repeat === 1 ? "month" : `${template.repeat} months`}`
        : "";
      return `${formatUsd(template.amountCents)} by ${when}${repeat}`;
    }
    case "remainder":
      return template.weight === 1 ? "remainder" : `remainder ×${template.weight}`;
  }
}

export function newTemplateId(): string {
  return crypto.randomUUID();
}
