/**
 * Lenient parser for RedNotebook month files (`YYYY-MM.txt`).
 *
 * RedNotebook stores one YAML-ish document per month: day-of-month integers map to
 * `{ text: '…', OptionalCategory: { … } }`. Whole-file strict YAML often fails on real
 * journals (`!!python/unicode`, long single-quoted scalars). We split on day keys and
 * extract `text` with a small unquoter instead.
 */

export type ParsedDayEntry = {
  /** Day of month 1–31. */
  dayOfMonth: number;
  text: string;
};

export type ParseMonthResult = {
  /** `YYYY-MM` from the filename when valid. */
  yearMonth: string | null;
  days: ParsedDayEntry[];
  warnings: string[];
};

/** Exact month file only — rejects `2018-06.CONFLICT_BACKUP….txt`. */
const MONTH_FILE_RE = /^(\d{4})-(\d{2})\.txt$/i;

/** Parse `2018-06.txt` → `2018-06`. Returns null if the name is not a month file. */
export function yearMonthFromFilename(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const m = MONTH_FILE_RE.exec(base);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}`;
}

/**
 * Build `YYYY-MM-DD` from a month key and day-of-month. Returns null if the day is not
 * valid in that month (e.g. 31 in February).
 */
export function dateKeyFor(yearMonth: string, dayOfMonth: number): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) return null;
  if (dayOfMonth < 1 || dayOfMonth > 31) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  // UTC noon construct then check components round-trip (rejects Feb 31).
  const d = new Date(Date.UTC(y, mo - 1, dayOfMonth, 12, 0, 0));
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() !== mo - 1 ||
    d.getUTCDate() !== dayOfMonth
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${String(dayOfMonth).padStart(2, "0")}`;
}

/** Strip PyYAML tags RedNotebook used to emit. */
function stripYamlTags(s: string): string {
  return s.replace(/!!python\/\w+\s*/g, "");
}

/**
 * Unquote a YAML single-quoted scalar starting at `s[0] === "'"`.
 * `''` is an escaped quote. Returns the value and index after the closing quote.
 */
function unquoteSingle(
  s: string,
  start: number,
): { value: string; end: number } | null {
  if (s[start] !== "'") return null;
  let i = start + 1;
  let out = "";
  while (i < s.length) {
    if (s[i] === "'") {
      if (s[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return { value: out, end: i + 1 };
    }
    out += s[i];
    i++;
  }
  return null;
}

/**
 * Unquote a double-quoted scalar. Supports common escapes (`\n`, `\\`, `\"`).
 */
function unquoteDouble(
  s: string,
  start: number,
): { value: string; end: number } | null {
  if (s[start] !== '"') return null;
  let i = start + 1;
  let out = "";
  while (i < s.length) {
    if (s[i] === "\\") {
      const next = s[i + 1];
      if (next === undefined) return null;
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else out += next;
      i += 2;
      continue;
    }
    if (s[i] === '"') return { value: out, end: i + 1 };
    out += s[i];
    i++;
  }
  return null;
}

/**
 * Extract the `text` field from a day's value chunk (everything after `N:`).
 * Handles flow `{text: '…'}` and block-style `text: '…'` / `text: |`.
 */
export function extractTextField(chunk: string): string | null {
  const cleaned = stripYamlTags(chunk.trim());
  // Locate `text:` (word boundary) case-sensitive as RedNotebook writes it.
  const textKey = /\btext\s*:\s*/.exec(cleaned);
  if (!textKey || textKey.index === undefined) return null;
  const after = cleaned.slice(textKey.index + textKey[0].length);

  if (after.startsWith("'")) {
    const r = unquoteSingle(after, 0);
    return r ? r.value : null;
  }
  if (after.startsWith('"')) {
    const r = unquoteDouble(after, 0);
    return r ? r.value : null;
  }

  // Block scalar | or > — take rest of line and following indented lines roughly.
  if (after.startsWith("|") || after.startsWith(">")) {
    const lines = after.split("\n").slice(1);
    const body: string[] = [];
    for (const line of lines) {
      if (line === "" || /^\s/.test(line)) {
        body.push(line.replace(/^\s{2}/, ""));
      } else {
        break;
      }
    }
    return body.join("\n").replace(/\n$/, "");
  }

  // Bare scalar until comma/closing brace/newline.
  const bare = /^([^,}\n]+)/.exec(after);
  return bare ? bare[1].trim() : null;
}

/**
 * Parse one month file body into day entries. Order follows file order.
 */
export function parseMonthFile(filename: string, content: string): ParseMonthResult {
  const warnings: string[] = [];
  const yearMonth = yearMonthFromFilename(filename);
  if (!yearMonth) {
    warnings.push(`Skipped "${filename}": expected a name like 2018-06.txt`);
    return { yearMonth: null, days: [], warnings };
  }

  const dayHeader = /^(\d{1,2}):\s*/gm;
  const indices: { day: number; contentStart: number; start: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = dayHeader.exec(content)) !== null) {
    indices.push({
      day: Number(match[1]),
      start: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  if (indices.length === 0) {
    warnings.push(`${yearMonth}: no day entries found`);
    return { yearMonth, days: [], warnings };
  }

  const days: ParsedDayEntry[] = [];
  for (let i = 0; i < indices.length; i++) {
    const end = i + 1 < indices.length ? indices[i + 1].start : content.length;
    const chunk = content.slice(indices[i].contentStart, end);
    const text = extractTextField(chunk);
    if (text === null) {
      warnings.push(
        `${yearMonth}-${String(indices[i].day).padStart(2, "0")}: could not read text`,
      );
      continue;
    }
    // Empty days exist in RedNotebook; keep them so the date still appears.
    days.push({ dayOfMonth: indices[i].day, text });
  }

  return { yearMonth, days, warnings };
}
