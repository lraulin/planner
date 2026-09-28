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
