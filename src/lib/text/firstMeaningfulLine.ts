/** The first line with anything on it, trimmed — a pasted file's header — or "" for none. */
export function firstMeaningfulLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}
