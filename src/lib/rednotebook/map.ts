import { rednotebookToMarkdown } from "./markup";
import { dateKeyFor, parseMonthFile } from "./parse";

export type MappedJournalDay = {
  dateKey: string;
  body: string;
  contexts: string[];
};

export type MapFilesResult = {
  days: MappedJournalDay[];
  warnings: string[];
};

/**
 * Parse and convert one or more RedNotebook month files into journal-ready day rows.
 * Later files overwrite earlier ones for the same dateKey (last wins in the batch).
 */
export function mapRedNotebookFiles(
  files: { name: string; text: string }[],
): MapFilesResult {
  const warnings: string[] = [];
  const byDate = new Map<string, MappedJournalDay>();

  for (const file of files) {
    const parsed = parseMonthFile(file.name, file.text);
    warnings.push(...parsed.warnings);
    if (!parsed.yearMonth) continue;

    for (const day of parsed.days) {
      const dateKey = dateKeyFor(parsed.yearMonth, day.dayOfMonth);
      if (!dateKey) {
        warnings.push(
          `${parsed.yearMonth}: day ${day.dayOfMonth} is not a valid calendar date`,
        );
        continue;
      }
      const { markdown, contexts } = rednotebookToMarkdown(day.text);
      byDate.set(dateKey, { dateKey, body: markdown, contexts });
    }
  }

  const days = [...byDate.values()].sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0,
  );
  return { days, warnings };
}
