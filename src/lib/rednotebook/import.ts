import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { fromDateKey } from "@/lib/schedule/geometry";
import { between } from "@/lib/tree/sortKey";
import { mapRedNotebookFiles } from "./map";
import { normalizeBody } from "./markup";

import { REDNOTEBOOK_SUBJECT } from "./types";

export { REDNOTEBOOK_SUBJECT } from "./types";

export type RedNotebookImportResult = {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
};

const APPEND_SEPARATOR = "\n\n---\n\n";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function findRednotebookForDay(
  tx: Executor,
  userId: string,
  dayKey: string,
): Promise<{ id: string; body: string; contexts: string[] } | null> {
  const [row] = await tx
    .select({
      id: notes.id,
      body: notes.body,
      contexts: notes.contexts,
    })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.subject, REDNOTEBOOK_SUBJECT),
        sql`${notes.noteDate}::date = ${dayKey}::date`,
      ),
    )
    .orderBy(asc(notes.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Import RedNotebook month files as **flat** notes with subject `Rednotebook`.
 *
 * - Exact body match (trailing newlines normalized) → skip
 * - Existing same-date note with different body → append if not already contained
 * - No note for that date → create at the notes root
 */
export async function importRedNotebookFiles(params: {
  userId: string;
  files: { name: string; text: string }[];
}): Promise<RedNotebookImportResult> {
  const { userId, files } = params;
  const mapped = mapRedNotebookFiles(files);
  const warnings = [...mapped.warnings];

  if (mapped.days.length === 0) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      warnings:
        warnings.length > 0
          ? warnings
          : ["No day entries found in the selected files."],
    };
  }

  return db.transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const day of mapped.days) {
      const existing = await findRednotebookForDay(tx, userId, day.dateKey);
      const incoming = normalizeBody(day.body);

      if (existing) {
        const current = normalizeBody(existing.body);

        if (current === incoming) {
          const mergedContexts = mergeContexts(existing.contexts, day.contexts);
          if (contextsChanged(existing.contexts, mergedContexts)) {
            await tx
              .update(notes)
              .set({ contexts: mergedContexts, updatedAt: new Date() })
              .where(and(eq(notes.id, existing.id), eq(notes.userId, userId)));
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        if (current.includes(incoming) && incoming.length > 0) {
          skipped++;
          continue;
        }

        const nextBody =
          current.length === 0
            ? incoming
            : incoming.length === 0
              ? current
              : `${current}${APPEND_SEPARATOR}${incoming}`;

        const mergedContexts = mergeContexts(existing.contexts, day.contexts);
        await tx
          .update(notes)
          .set({
            body: nextBody,
            title: day.dateKey,
            contexts: mergedContexts,
            updatedAt: new Date(),
          })
          .where(and(eq(notes.id, existing.id), eq(notes.userId, userId)));
        updated++;
        continue;
      }

      const [last] = await tx
        .select({ sortKey: notes.sortKey })
        .from(notes)
        .where(and(eq(notes.userId, userId), isNull(notes.parentId)))
        .orderBy(sql`${notes.sortKey} desc`)
        .limit(1);

      await tx.insert(notes).values({
        userId,
        parentId: null,
        sortKey: between(last?.sortKey ?? null, null),
        title: day.dateKey,
        subject: REDNOTEBOOK_SUBJECT,
        body: incoming,
        noteDate: fromDateKey(day.dateKey),
        contexts: day.contexts,
      });
      created++;
    }

    return { created, updated, skipped, warnings };
  });
}

function mergeContexts(existing: string[], incoming: string[]): string[] {
  const out = [...existing];
  const seen = new Set(existing);
  for (const c of incoming) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function contextsChanged(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((v, i) => v !== b[i]);
}
