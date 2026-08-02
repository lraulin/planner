/**
 * Best-effort plain text from Achieve's RTF notes.
 *
 * Not a full RTF reader — just enough that an import is readable. Empty or non-RTF input
 * is returned trimmed as-is.
 */
export function rtfToPlainText(input: string | null | undefined): string {
  if (!input) return "";
  const text = input.trim();
  if (!text) return "";
  if (!text.startsWith("{\\rtf")) {
    return text;
  }

  let out = text;
  // Drop groups we never want as body text.
  out = out.replace(/\{\\fonttbl[\s\S]*?\}/gi, "");
  out = out.replace(/\{\\colortbl[\s\S]*?\}/gi, "");
  out = out.replace(/\{\\stylesheet[\s\S]*?\}/gi, "");
  out = out.replace(/\{\\\*\\[^}]*\}/g, "");

  // Line breaks.
  out = out.replace(/\\par[d]?/gi, "\n");
  out = out.replace(/\\line/gi, "\n");
  out = out.replace(/\\tab/gi, "\t");

  // Unicode escapes \'hh and \uN?
  out = out.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  out = out.replace(/\\u(-?\d+)\??/g, (_, n: string) => {
    const code = Number(n);
    return code < 0 ? "" : String.fromCharCode(code);
  });

  // Control words and leftover braces.
  out = out.replace(/\\[a-z]+-?\d*[ ]?/gi, "");
  out = out.replace(/[{}]/g, "");
  out = out.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Collapse runs of blank lines and spaces on a line.
  out = out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return out;
}
