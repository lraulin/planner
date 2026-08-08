import { parseTomboyNote, type ParsedTomboyNote, type TomboyFile } from "./parse";

export type TomboyMapResult = {
  notes: ParsedTomboyNote[];
  templatesSkipped: number;
  ignoredFiles: number;
  invalidFiles: number;
  warnings: string[];
};

/** Parse a browser file/folder selection, keeping valid notes even when neighbours fail. */
export function mapTomboyFiles(files: TomboyFile[]): TomboyMapResult {
  const notes: ParsedTomboyNote[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let templatesSkipped = 0;
  let ignoredFiles = 0;
  let invalidFiles = 0;

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".note")) {
      ignoredFiles++;
      continue;
    }

    try {
      const note = parseTomboyNote(file);
      if (seen.has(note.sourceId)) {
        warnings.push(`${file.name}: duplicate Tomboy UUID; ignored.`);
        continue;
      }
      seen.add(note.sourceId);

      if (note.isTemplate) {
        templatesSkipped++;
        continue;
      }
      if (note.unknownMarkup.length > 0) {
        warnings.push(
          `${file.name}: preserved text from unknown markup (${note.unknownMarkup.join(", ")}).`,
        );
      }
      notes.push(note);
    } catch (error) {
      invalidFiles++;
      const message = error instanceof Error ? error.message : "could not parse file";
      warnings.push(`${file.name}: ${message}.`);
    }
  }

  if (ignoredFiles > 0) {
    warnings.unshift(
      `Ignored ${ignoredFiles} non-note file${ignoredFiles === 1 ? "" : "s"} from the selection.`,
    );
  }

  return { notes, templatesSkipped, ignoredFiles, invalidFiles, warnings };
}
