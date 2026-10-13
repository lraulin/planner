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

const isBreak = (ch: string | undefined): boolean => ch === "\n" || ch === "\r";
const isBlank = (ch: string | undefined): boolean => ch === " " || ch === "\t";

/**
 * Read the line break at `s[at]` and everything that folds with it, as YAML does inside a
 * flow scalar: one break is a single space, and a run of `n` breaks (empty lines between
 * them) is `n - 1` newlines. Leading indentation on the continuation line is not content.
 *
 * PyYAML wraps a long scalar at the first space past column 80 and indents the continuation,
 * so this is not an edge: any entry longer than a line is stored with these breaks in it.
 */
function foldBreak(s: string, at: number): { text: string; next: number } {
  let i = at;
  let breaks = 0;
  while (i < s.length) {
    if (s[i] === "\r" && s[i + 1] === "\n") i += 2;
    else if (isBreak(s[i])) i += 1;
    else break;
    breaks += 1;
    while (isBlank(s[i])) i += 1;
    if (!isBreak(s[i])) break;
  }
  return { text: breaks === 1 ? " " : "\n".repeat(breaks - 1), next: i };
}

/** Drop whitespace written before a fold, but never whitespace an escape produced. */
function trimRaw(out: string, protectedLength: number): string {
  let end = out.length;
  while (end > protectedLength && isBlank(out[end - 1])) end -= 1;
  return out.slice(0, end);
}

/**
 * Unquote a YAML single-quoted scalar starting at `s[0] === "'"`.
 * `''` is an escaped quote, and a line break folds (see `foldBreak`). Returns the value and
 * the index after the closing quote.
 */
function unquoteSingle(
  s: string,
  start: number,
): { value: string; end: number } | null {
  if (s[start] !== "'") return null;
  let i = start + 1;
  let out = "";
  let protectedLength = 0;
  while (i < s.length) {
    if (s[i] === "'") {
      if (s[i + 1] === "'") {
        out += "'";
        protectedLength = out.length;
        i += 2;
        continue;
      }
      return { value: out, end: i + 1 };
    }
    if (isBreak(s[i])) {
      const fold = foldBreak(s, i);
      out = trimRaw(out, protectedLength) + fold.text;
      protectedLength = out.length;
      i = fold.next;
      continue;
    }
    out += s[i];
    i++;
  }
  return null;
}

/** The single-character escapes of YAML 1.1 double-quoted scalars. */
const SIMPLE_ESCAPES: Record<string, string> = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "\t",
  "\t": "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\u0085",
  _: " ",
  L: " ",
  P: " ",
};

const HEX_ESCAPE_LENGTH: Record<string, number> = { x: 2, u: 4, U: 8 };

/**
 * Unquote a double-quoted scalar: the YAML escape set (including the `\xNN`, `\uNNNN` and
 * `\UNNNNNNNN` PyYAML writes for non-ASCII text when it is not told to allow Unicode), an
 * escaped line break (joins the lines with nothing between), and the same folding as a
 * single-quoted scalar. An escape that is not valid is kept as written.
 */
function unquoteDouble(
  s: string,
  start: number,
): { value: string; end: number } | null {
  if (s[start] !== '"') return null;
  let i = start + 1;
  let out = "";
  let protectedLength = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\") {
      const next = s[i + 1];
      if (next === undefined) return null;

      if (isBreak(next)) {
        // Escaped break: drop it and the next line's indentation, add nothing.
        i += next === "\r" && s[i + 2] === "\n" ? 3 : 2;
        while (isBlank(s[i])) i += 1;
        protectedLength = out.length;
        continue;
      }

      const hexLength = HEX_ESCAPE_LENGTH[next];
      if (hexLength !== undefined) {
        const digits = s.slice(i + 2, i + 2 + hexLength);
        const code = /^[0-9a-fA-F]+$/.test(digits) ? Number.parseInt(digits, 16) : NaN;
        if (
          digits.length === hexLength &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
        ) {
          out += String.fromCodePoint(code);
          i += 2 + hexLength;
        } else {
          out += `\\${next}`;
          i += 2;
        }
        protectedLength = out.length;
        continue;
      }

      out += SIMPLE_ESCAPES[next] ?? next;
      protectedLength = out.length;
      i += 2;
      continue;
    }
    if (ch === '"') return { value: out, end: i + 1 };
    if (isBreak(ch)) {
      const fold = foldBreak(s, i);
      out = trimRaw(out, protectedLength) + fold.text;
      protectedLength = out.length;
      i = fold.next;
      continue;
    }
    out += ch;
    i++;
  }
  return null;
}

/**
 * A plain (unquoted) scalar, folded the same way. It ends at a `,` or `}` in a flow mapping.
 * In block style a continuation line is an indented line that does not open a new `key:` —
 * a plain scalar cannot contain `: `, so a line that does is the next entry, not more text.
 * (The day header's own `\s*` has already eaten the key's indentation, so "deeper than the
 * key" is not something this can measure; "indented, and not a key" is.)
 */
function readPlain(after: string, flow: boolean): string {
  let out = "";
  let i = 0;
  while (i < after.length) {
    const ch = after[i];
    if (flow && (ch === "," || ch === "}")) break;
    if (isBreak(ch)) {
      const fold = foldBreak(after, i);
      if (!continuesPlain(after, fold.next, flow)) break;
      out = out.replace(/[ \t]+$/, "") + fold.text;
      i = fold.next;
      continue;
    }
    out += ch;
    i++;
  }
  return out.trim();
}

function continuesPlain(s: string, at: number, flow: boolean): boolean {
  if (at >= s.length) return false;
  if (flow) return true;
  let lineStart = at;
  while (lineStart > 0 && !isBreak(s[lineStart - 1])) lineStart -= 1;
  if (at === lineStart) return false; // not indented
  let lineEnd = at;
  while (lineEnd < s.length && !isBreak(s[lineEnd])) lineEnd += 1;
  return !/^[^\s:,{}[\]#][^:]*:(\s|$)/.test(s.slice(at, lineEnd));
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

  // Plain scalar. Flow if the key sits inside an open `{`, else block.
  const before = cleaned.slice(0, textKey.index);
  const flow = (before.match(/\{/g)?.length ?? 0) > (before.match(/\}/g)?.length ?? 0);
  const plain = readPlain(after, flow);
  return plain === "" ? null : plain;
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
