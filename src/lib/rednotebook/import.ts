import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import {
  ensureJournalMonth,
  findJournalForDay,
  rehomeAllJournalNotes,
  rehomeJournalNote,
} from "@/lib/day/journalPath";
import { JOURNAL_SUBJECT } from "@/lib/day/types";
import { fromDateKey } from "@/lib/schedule/geometry";
import { between } from "@/lib/tree/sortKey";
import { mapRedNotebookFiles } from "./map";
import { normalizeBody } from "./markup";

export type RedNotebookImportResult = {
  created: number;
  updated: number;
  skipped: number;
  rehomed: number;
  warnings: string[];
};

const APPEND_SEPARATOR = "\n\n---\n\n";

/**
 * Import RedNotebook month files as Day journal notes under Journal / YYYY / YYYY-MM.
 *
 * - Exact body match (trailing newlines normalized) → skip
 * - Existing journal with different body → append if imported text not already contained
 * - No journal → create
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
      rehomed: 0,
      warnings:
        warnings.length > 0
          ? warnings
          : ["No day entries found in the selected files."],
    };
  }

  return db.transaction(async (tx) => {
    const rehomed = await rehomeAllJournalNotes(tx, userId);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const day of mapped.days) {
      const { monthId } = await ensureJournalMonth(tx, userId, day.dateKey);
      const existing = await findJournalForDay(tx, userId, day.dateKey);
      const incoming = normalizeBody(day.body);

      if (existing) {
        await rehomeJournalNote(tx, userId, existing.id, monthId);
        const current = normalizeBody(existing.body);

        if (current === incoming) {
          // Still merge contexts if import found tags the note lacks.
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

        // Already contains the imported text → treat as skip (idempotent append).
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
        .where(and(eq(notes.userId, userId), eq(notes.parentId, monthId)))
        .orderBy(sql`${notes.sortKey} desc`)
        .limit(1);

      await tx.insert(notes).values({
        userId,
        parentId: monthId,
        sortKey: between(last?.sortKey ?? null, null),
        title: day.dateKey,
        subject: JOURNAL_SUBJECT,
        body: incoming,
        noteDate: fromDateKey(day.dateKey),
        contexts: day.contexts,
      });
      created++;
    }

    return { created, updated, skipped, rehomed, warnings };
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
