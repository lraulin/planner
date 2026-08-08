import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import { mapTomboyFiles } from "./map";
import type { ParsedTomboyNote, TomboyFile } from "./parse";

export const TOMBOY_SUBJECT = "Tomboy";
export const TOMBOY_SOURCE = "tomboy";

export type TomboyImportResult = {
  created: number;
  updated: number;
  skipped: number;
  templatesSkipped: number;
  ignoredFiles: number;
  invalidFiles: number;
  warnings: string[];
};

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type ImportedRow = {
  id: string;
  title: string;
  subject: string;
  body: string;
  contexts: string[];
  noteDate: Date | null;
  updatedAt: Date;
};

async function findImportedNote(
  tx: Tx,
  userId: string,
  sourceId: string,
): Promise<ImportedRow | null> {
  const [row] = await tx
    .select({
      id: notes.id,
      title: notes.title,
      subject: notes.subject,
      body: notes.body,
      contexts: notes.contexts,
      noteDate: notes.noteDate,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.externalSource, TOMBOY_SOURCE),
        eq(notes.externalId, sourceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Import Tomboy XML notes at the Notes root.
 *
 * Tomboy is the source only while its change instant is newer. A Planner edit advances
 * `updatedAt`, so re-selecting an old archive cannot overwrite prose changed after import.
 */
export async function importTomboyFiles(params: {
  userId: string;
  files: TomboyFile[];
}): Promise<TomboyImportResult> {
  const { userId, files } = params;
  const mapped = mapTomboyFiles(files);

  if (mapped.notes.length === 0) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      templatesSkipped: mapped.templatesSkipped,
      ignoredFiles: mapped.ignoredFiles,
      invalidFiles: mapped.invalidFiles,
      warnings:
        mapped.warnings.length > 0
          ? mapped.warnings
          : ["No ordinary Tomboy notes found in the selected files."],
    };
  }

  return db.transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const warnings = [...mapped.warnings];

    const [lastRoot] = await tx
      .select({ sortKey: notes.sortKey })
      .from(notes)
      .where(and(eq(notes.userId, userId), isNull(notes.parentId)))
      .orderBy(sql`${notes.sortKey} desc`)
      .limit(1);
    let lastRootSortKey = lastRoot?.sortKey ?? null;

    for (const incoming of mapped.notes) {
      const existing = await findImportedNote(tx, userId, incoming.sourceId);
      if (existing) {
        if (sameImportedValues(existing, incoming)) {
          skipped++;
          continue;
        }

        // A local edit is newer than this archive. Keep it instead of turning a repeatable
        // import into an accidental restore operation.
        if (existing.updatedAt.getTime() > incoming.updatedAt.getTime()) {
          skipped++;
          continue;
        }

        await tx
          .update(notes)
          .set({
            title: incoming.title,
            subject: TOMBOY_SUBJECT,
            body: incoming.body,
            contexts: incoming.contexts,
            noteDate: incoming.noteDate,
            updatedAt: incoming.updatedAt,
          })
          .where(and(eq(notes.id, existing.id), eq(notes.userId, userId)));
        updated++;
        continue;
      }

      const sortKey = between(lastRootSortKey, null);
      await tx.insert(notes).values({
        userId,
        parentId: null,
        sortKey,
        title: incoming.title,
        subject: TOMBOY_SUBJECT,
        body: incoming.body,
        noteDate: incoming.noteDate,
        contexts: incoming.contexts,
        externalSource: TOMBOY_SOURCE,
        externalId: incoming.sourceId,
        createdAt: incoming.createdAt,
        updatedAt: incoming.updatedAt,
      });
      lastRootSortKey = sortKey;
      created++;
    }

    return {
      created,
      updated,
      skipped,
      templatesSkipped: mapped.templatesSkipped,
      ignoredFiles: mapped.ignoredFiles,
      invalidFiles: mapped.invalidFiles,
      warnings,
    };
  });
}

function sameImportedValues(
  existing: ImportedRow,
  incoming: ParsedTomboyNote,
): boolean {
  return (
    existing.title === incoming.title &&
    existing.subject === TOMBOY_SUBJECT &&
    existing.body === incoming.body &&
    arraysEqual(existing.contexts, incoming.contexts) &&
    existing.noteDate?.getTime() === incoming.noteDate.getTime() &&
    existing.updatedAt.getTime() === incoming.updatedAt.getTime()
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
