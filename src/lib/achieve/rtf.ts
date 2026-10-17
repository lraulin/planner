/**
 * Best-effort plain text from Achieve's RTF notes.
 *
 * Not a full RTF reader — just enough that an import is readable: group nesting (so a font
 * table, `{\info …}`, a picture or a field instruction is dropped whole), the escapes
 * (`\'hh` as Windows-1252, `\uN` as a signed 16-bit unit, `\{ \} \\`), and the handful of
 * words that carry a paragraph or a punctuation mark. Empty or non-RTF input is returned
 * trimmed as-is.
 */
export function rtfToPlainText(input: string | null | undefined): string {
  if (!input) return "";
  const text = input.trim();
  if (!text) return "";
  if (!text.startsWith("{\\rtf")) {
    return text;
  }

  return tidy(extractText(text));
}

/** Groups whose content is not body text. `\*` marks any destination a reader may skip. */
const SKIPPED_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "header",
  "headerl",
  "headerr",
  "headerf",
  "footer",
  "footerl",
  "footerr",
  "footerf",
  "footnote",
  "listtable",
  "listoverridetable",
  "rsidtbl",
  "generator",
  "fldinst",
  "themedata",
  "colorschememapping",
  "datastore",
  "latentstyles",
  "xmlnstbl",
  "private",
]);

/** Control words that stand for text. */
const WORD_TEXT: Record<string, string> = {
  par: "\n",
  line: "\n",
  sect: "\n",
  page: "\n",
  tab: "\t",
  emdash: "—",
  endash: "–",
  emspace: " ",
  enspace: " ",
  bullet: "•",
  lquote: "‘",
  rquote: "’",
  ldblquote: "“",
  rdblquote: "”",
};

/** Windows-1252 differs from Latin-1 only in 0x80–0x9F; these are the printable ones. */
const CP1252_C1: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

type Group = {
  /** Text inside is dropped. Inherited by nested groups. */
  skip: boolean;
  /** How many fallback characters follow each `\uN` (`\ucN`); scoped to the group. */
  unicodeSkip: number;
};

const isLetter = (char: string): boolean => /[A-Za-z]/.test(char);
const isDigit = (char: string): boolean => char >= "0" && char <= "9";

function extractText(rtf: string): string {
  let out = "";
  const stack: Group[] = [];
  let group: Group = { skip: false, unicodeSkip: 1 };
  /** Fallback characters still to be swallowed after the last `\uN`. */
  let pendingSkip = 0;
  let nextIsDestination = false;

  const emit = (value: string): void => {
    if (group.skip) return;
    out += value;
  };

  let i = 0;
  while (i < rtf.length) {
    const char = rtf[i];

    if (char === "{") {
      stack.push(group);
      group = { ...group };
      nextIsDestination = true;
      pendingSkip = 0;
      i++;
      continue;
    }
    if (char === "}") {
      group = stack.pop() ?? group;
      nextIsDestination = false;
      pendingSkip = 0;
      i++;
      continue;
    }

    if (char !== "\\") {
      // A bare CR or LF is not text in RTF; the writer's own line wrapping.
      if (char !== "\r" && char !== "\n") {
        if (pendingSkip > 0) pendingSkip--;
        else emit(char);
      }
      nextIsDestination = false;
      i++;
      continue;
    }

    const next = rtf[i + 1];
    if (next === undefined) break;

    if (next === "'") {
      const hex = rtf.slice(i + 2, i + 4);
      i += 2;
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        i += 2;
        if (pendingSkip > 0) pendingSkip--;
        else {
          const byte = Number.parseInt(hex, 16);
          emit(CP1252_C1[byte] ?? String.fromCharCode(byte));
        }
      }
      nextIsDestination = false;
      continue;
    }

    if (next === "\\" || next === "{" || next === "}") {
      if (pendingSkip > 0) pendingSkip--;
      else emit(next);
      nextIsDestination = false;
      i += 2;
      continue;
    }

    if (next === "*") {
      // `{\*\word …}` is a destination a reader that does not know it must drop.
      if (nextIsDestination) group.skip = true;
      i += 2;
      continue;
    }

    if (next === "~") {
      emit(" ");
      nextIsDestination = false;
      i += 2;
      continue;
    }
    if (next === "-" || next === "_") {
      emit(next === "_" ? "‑" : "");
      nextIsDestination = false;
      i += 2;
      continue;
    }
    if (next === "\n" || next === "\r") {
      emit("\n");
      nextIsDestination = false;
      i += 2;
      continue;
    }

    if (!isLetter(next)) {
      // `\|`, `\:` and the like: formatting we do not render.
      nextIsDestination = false;
      i += 2;
      continue;
    }

    // A control word: letters, an optional signed number, and one optional space.
    let end = i + 1;
    while (end < rtf.length && isLetter(rtf[end])) end++;
    const word = rtf.slice(i + 1, end).toLowerCase();
    let numberText = "";
    if (rtf[end] === "-" || isDigit(rtf[end] ?? "")) {
      const numberStart = end;
      end++;
      while (end < rtf.length && isDigit(rtf[end])) end++;
      numberText = rtf.slice(numberStart, end);
    }
    if (rtf[end] === " ") end++;
    i = end;

    const wasDestination = nextIsDestination;
    nextIsDestination = false;

    if (word === "uc") {
      group.unicodeSkip = Math.max(0, Number.parseInt(numberText, 10) || 0);
    } else if (word === "u") {
      const unit = Number.parseInt(numberText, 10);
      if (Number.isFinite(unit)) {
        // RTF writes a UTF-16 unit as a signed 16-bit number.
        emit(String.fromCharCode(unit < 0 ? unit + 0x10000 : unit));
        pendingSkip = group.unicodeSkip;
      }
    } else if (
      SKIPPED_DESTINATIONS.has(word) &&
      (wasDestination || stack.length === 0)
    ) {
      group.skip = true;
    } else if (word in WORD_TEXT) {
      emit(WORD_TEXT[word]);
    }
  }

  return out;
}

function tidy(text: string): string {
  // Collapse runs of blank lines and spaces on a line. NUL goes first: RTF writers pad a
  // stored blob with it after the closing brace, and a Postgres text column refuses it.
  return text
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
