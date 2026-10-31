/**
 * Small RFC-style CSV helpers shared by metrics tracking and detail sub-item lists.
 *
 * Export quotes fields that need it; import accepts multi-line quoted fields so a
 * description with a newline round-trips.
 */

/** Escape one CSV field (quote when commas, quotes, or newlines appear). */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * A cell that starts with `=`, `+`, `-`, `@`, a tab or a CR is a formula to Excel and Sheets,
 * and exported text comes from third parties (a bank's payee, an Amazon product name). Such a
 * cell is written with a leading `'`, which both programs read as "this is text" and do not show.
 *
 * Leading apostrophes are part of the trigger so the mapping can be undone exactly:
 * `restoreCsvText(neutralizeCsvText(s)) === s` for every `s`.
 *
 * **Plain numbers are left alone.** `-12.34`, `+5`, `-$1,234.50` and `-12%` start with a
 * trigger and are not formulas; prefixing them would turn every negative amount in a money
 * column into text. A single character (`-` as an empty placeholder) is not a formula either.
 */
const FORMULA_START = /^'*[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\$?[+-]?(?:\d[\d,]*\.?\d*|\.\d+)%?$/;

export function neutralizeCsvText(value: string): string {
  if (value.length < 2 || !FORMULA_START.test(value) || PLAIN_NUMBER.test(value)) {
    return value;
  }
  return `'${value}`;
}

/** Undo {@link neutralizeCsvText} on a cell read back from a file this app wrote. */
export function restoreCsvText(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1))
    ? value.slice(1)
    : value;
}

/** {@link escapeCsvField} for a cell of exported data: formula-neutral first, then quoted. */
export function escapeCsvCell(value: string): string {
  return escapeCsvField(neutralizeCsvText(value));
}

/**
 * Split a single CSV line into fields. Handles quoted fields with commas and `""`
 * escapes. Does **not** span lines — use {@link parseCsvRows} for multi-line cells.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * A header cell reduced to lowercase letters and digits, so "Posting Date", "posting_date"
 * and "Posting date " match one key. The importers that recognise a file by its header row
 * all match on this.
 */
export function normalizeCsvHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Parse a whole CSV document into rows of fields. Quoted fields may contain commas
 * and newlines. Strips a leading BOM. Drops rows that are entirely blank.
 */
export function parseCsvRows(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  return rows;
}

/** One kept row from {@link parseCsvRowsWithLines}, tagged with where it actually sits. */
export type CsvLine = { cells: string[]; line: number };

/**
 * Same walk as {@link parseCsvRows}, but tags each kept row with its 1-based physical line
 * number in the source text — the number a spreadsheet or text editor would show.
 *
 * `parseCsvRows` drops blank rows before a caller ever sees an index, so a caller that
 * reports "row N" to the user by counting the array it got back is wrong by one for every
 * blank line above N — off by more the further into the file a warning fires. Every CSV
 * importer that surfaces row numbers in an error message (`amazon/csv.ts`, `metrics/csv.ts`,
 * `finances/formats.ts`, `finances/coinbaseCsv.ts`, `detail/itemCsv.ts`) needs this instead
 * of `parseCsvRows`, so the row a warning names is the row the person actually has open.
 */
export function parseCsvRowsWithLines(text: string): CsvLine[] {
  const s = text.replace(/^﻿/, "");
  const rows: CsvLine[] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        // A quoted cell may itself contain a newline (what `escapeCsvField` writes); that
        // still advances the physical line count even though the row has not ended.
        if (ch === "\n") line++;
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell.trim() !== ""))
        rows.push({ cells: row, line: rowStartLine });
      row = [];
      line++;
      rowStartLine = line;
      continue;
    }
    cur += ch;
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    if (row.some((cell) => cell.trim() !== ""))
      rows.push({ cells: row, line: rowStartLine });
  }

  return rows;
}

/**
 * Column positions by normalised header name, so a parser reads `amount` wherever the bank
 * put it. A repeated header keeps its first position.
 */
export function csvHeaderIndex(headerCells: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();
  headerCells.forEach((cell, i) => {
    const key = normalizeCsvHeader(cell);
    if (!index.has(key)) index.set(key, i);
  });
  return index;
}

/** The trimmed cell at `index`, or empty when the column is absent from this file. */
export function csvCell(cells: readonly string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (cells[index] ?? "").trim();
}
