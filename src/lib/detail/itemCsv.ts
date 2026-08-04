import type { NodeItem } from "@/db/schema";
import { escapeCsvField, parseCsvRows } from "@/lib/csv/text";
import type { NodeItemValues } from "@/lib/detail/types";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import { formatPriority, parsePriority } from "@/lib/tree/format";

/**
 * CSV import/export for the detail form's repeating lists (Benefits, Objectives, …).
 *
 * Columns follow the kind's editor fields (not just the summary strip), so a round-trip
 * keeps description, criteria, and the other extras. Priority is written as Achieve's
 * compact form (`A1`, `B`). Dates are `YYYY-MM-DD`. Booleans are `Yes` / `No`.
 *
 * Pure: no database. Callers append the parsed rows via `importNodeItems`.
 */

/** Field shape the CSV layer needs — mirrors `itemKinds` without importing UI code. */
export type ItemCsvField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "priority" | "number" | "select" | "check" | "date";
};

export type ParseItemsCsvResult = {
  rows: NodeItemValues[];
  /** 1-based data row numbers (header is row 1) that could not be parsed. */
  errors: { row: number; message: string }[];
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Header aliases so "Pri" / "Name" / "Summary" still map when labels differ by kind. */
const HEADER_ALIASES: Record<string, string> = {
  pri: "priority",
  priority: "priority",
  name: "title",
  summary: "title",
  title: "title",
  type: "itemtype",
  sev: "severity",
  severity: "severity",
  prob: "probability",
  probability: "probability",
  done: "completed",
  completed: "completed",
  date: "entrydate",
  entrydate: "entrydate",
};

function fieldHeaderKey(field: ItemCsvField): string {
  if (field.key === "priority") return "priority";
  return normalizeHeader(field.key);
}

function matchField(
  fields: readonly ItemCsvField[],
  header: string,
): ItemCsvField | undefined {
  const norm = normalizeHeader(header);
  if (!norm) return undefined;

  const byLabel = fields.find((f) => normalizeHeader(f.label) === norm);
  if (byLabel) return byLabel;

  const byKey = fields.find((f) => fieldHeaderKey(f) === norm);
  if (byKey) return byKey;

  const alias = HEADER_ALIASES[norm];
  if (alias) {
    return fields.find((f) => fieldHeaderKey(f) === alias);
  }
  return undefined;
}

function cellOf(item: NodeItem, field: ItemCsvField): string {
  if (field.kind === "priority") {
    return formatPriority(item.priorityLetter, item.priorityRank);
  }

  const value = item[field.key as keyof NodeItem];
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return toDateKey(value);
  return String(value);
}

/**
 * Export rows for one kind. Order is the caller's (usually the on-screen sort).
 * Always includes a header so an empty list still downloads a fillable template.
 */
export function itemsToCsv(
  fields: readonly ItemCsvField[],
  items: readonly NodeItem[],
): string {
  if (fields.length === 0) return "";

  const header = fields.map((f) => escapeCsvField(f.label)).join(",");
  const lines = items.map((item) =>
    fields.map((f) => escapeCsvField(cellOf(item, f))).join(","),
  );
  return [header, ...lines].join("\n") + (lines.length || fields.length ? "\n" : "");
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseBool(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (t === "" || t === "no" || t === "n" || t === "false" || t === "0") return false;
  if (t === "yes" || t === "y" || t === "true" || t === "1") return true;
  return null;
}

function parseNumber(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: Math.round(n) === n ? n : n };
}

/**
 * Parse a CSV produced by {@link itemsToCsv} (or a compatible sheet).
 * Header must match at least one known field for the kind (by label or key).
 * Completely blank data rows are skipped; invalid cells are row errors.
 */
export function parseItemsCsv(
  fields: readonly ItemCsvField[],
  text: string,
): ParseItemsCsvResult {
  const table = parseCsvRows(text);
  if (table.length === 0) {
    return { rows: [], errors: [{ row: 1, message: "File is empty." }] };
  }

  const header = table[0];
  const mapping: (ItemCsvField | null)[] = header.map(
    (h) => matchField(fields, h) ?? null,
  );
  if (!mapping.some(Boolean)) {
    const labels = fields.map((f) => f.label).join(", ");
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `Header must include at least one of: ${labels}.`,
        },
      ],
    };
  }

  const rows: NodeItemValues[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < table.length; i++) {
    const rowNum = i + 1;
    const cells = table[i];
    if (cells.every((c) => c.trim() === "")) continue;

    const values: NodeItemValues = {};
    let failed = false;

    for (let c = 0; c < mapping.length; c++) {
      const field = mapping[c];
      if (!field) continue;
      const raw = cells[c] ?? "";

      if (field.kind === "priority") {
        const parsed = parsePriority(raw);
        if (parsed === undefined) {
          errors.push({
            row: rowNum,
            message: `Invalid priority "${raw.trim() || "(empty)"}" (use A1, B, …).`,
          });
          failed = true;
          break;
        }
        values.priorityLetter = parsed.letter;
        values.priorityRank = parsed.rank;
        continue;
      }

      if (field.kind === "check") {
        const b = parseBool(raw);
        if (b === null) {
          errors.push({
            row: rowNum,
            message: `Invalid ${field.label} "${raw}" (use Yes/No).`,
          });
          failed = true;
          break;
        }
        (values as Record<string, unknown>)[field.key] = b;
        continue;
      }

      if (field.kind === "number") {
        const n = parseNumber(raw);
        if (!n.ok) {
          errors.push({
            row: rowNum,
            message: `Invalid ${field.label} "${raw}".`,
          });
          failed = true;
          break;
        }
        (values as Record<string, unknown>)[field.key] = n.value;
        continue;
      }

      if (field.kind === "date") {
        const t = raw.trim();
        if (t === "") {
          (values as Record<string, unknown>)[field.key] = null;
          continue;
        }
        if (!DATE_KEY.test(t)) {
          errors.push({
            row: rowNum,
            message: `${field.label} must be YYYY-MM-DD (got "${t}").`,
          });
          failed = true;
          break;
        }
        (values as Record<string, unknown>)[field.key] = fromDateKey(t);
        continue;
      }

      // text / textarea / select
      (values as Record<string, unknown>)[field.key] = raw;
    }

    if (failed) continue;

    // A row that only matched unknown columns is empty after mapping — skip it.
    if (Object.keys(values).length === 0) continue;
    rows.push(values);
  }

  return { rows, errors };
}
