/**
 * Date-tree projection of Journal + Rednotebook notes.
 *
 * Storage stays flat (no year/month folder notes). This is a display tree only — Year →
 * Month → entry leaves — for the Notes journal presentation. Grouping on the Notes grid
 * is a different arrangement and is not used here.
 */

import { JOURNAL_SUBJECT } from "@/lib/day/types";
import { REDNOTEBOOK_SUBJECT } from "@/lib/rednotebook/types";
import { toDateKey } from "@/lib/schedule/geometry";

export const DIARY_SUBJECTS = [JOURNAL_SUBJECT, REDNOTEBOOK_SUBJECT] as const;

export type DiarySubject = (typeof DIARY_SUBJECTS)[number];

export function isDiarySubject(subject: string): subject is DiarySubject {
  return subject === JOURNAL_SUBJECT || subject === REDNOTEBOOK_SUBJECT;
}

/** Lift a Notes list/detail row into the slimmer diary shape. */
export function diarySummaryFromNote(note: {
  id: string;
  subject: string;
  snippet: string;
  noteDate: Date | null;
  createdAt: Date;
}): DiarySummary {
  return {
    id: note.id,
    subject: note.subject,
    snippet: note.snippet,
    noteDate: note.noteDate,
    createdAt: note.createdAt,
  };
}

/** One dated Journal or Rednotebook note, list-shaped — snippet, never the body. */
export type DiarySummary = {
  id: string;
  subject: string;
  snippet: string;
  noteDate: Date | null;
  createdAt: Date;
};

export type DiaryEntry = {
  id: string;
  dateKey: string;
  subject: string;
  snippet: string;
  createdAt: Date;
};

export type DiaryMonth = {
  key: string;
  year: number;
  month: number;
  label: string;
  entries: DiaryEntry[];
};

export type DiaryYear = {
  key: string;
  year: number;
  months: DiaryMonth[];
};

export type DiaryTree = {
  years: DiaryYear[];
  markedDays: Set<string>;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function subjectRank(subject: string): number {
  if (subject === JOURNAL_SUBJECT) return 0;
  if (subject === REDNOTEBOOK_SUBJECT) return 1;
  return 2;
}

/**
 * Build the Year → Month → entry tree. Undated and empty-snippet rows are dropped so the
 * calendar and tree only show days that actually have writing.
 *
 * Newest year and month first; newest day first within a month. On one day, Journal before
 * Rednotebook, then oldest `createdAt` first.
 */
export function buildDiaryTree(summaries: readonly DiarySummary[]): DiaryTree {
  const byMonth = new Map<string, DiaryEntry[]>();
  const markedDays = new Set<string>();

  for (const summary of summaries) {
    if (!isDiarySubject(summary.subject)) continue;
    if (!summary.noteDate) continue;
    if (summary.snippet.trim() === "") continue;

    const dateKey = toDateKey(summary.noteDate);
    const monthKey = dateKey.slice(0, 7);
    const entry: DiaryEntry = {
      id: summary.id,
      dateKey,
      subject: summary.subject,
      snippet: summary.snippet,
      createdAt: summary.createdAt,
    };
    const bucket = byMonth.get(monthKey);
    if (bucket) bucket.push(entry);
    else byMonth.set(monthKey, [entry]);
    markedDays.add(dateKey);
  }

  const monthsByYear = new Map<string, DiaryMonth[]>();
  for (const [monthKey, entries] of byMonth) {
    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));
    entries.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1;
      const subjectDelta = subjectRank(a.subject) - subjectRank(b.subject);
      if (subjectDelta !== 0) return subjectDelta;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const yearKey = String(year);
    const monthNode: DiaryMonth = {
      key: monthKey,
      year,
      month,
      label: MONTH_LABELS[month - 1] ?? monthKey,
      entries,
    };
    const yearMonths = monthsByYear.get(yearKey);
    if (yearMonths) yearMonths.push(monthNode);
    else monthsByYear.set(yearKey, [monthNode]);
  }

  const years: DiaryYear[] = [...monthsByYear.entries()]
    .map(([key, months]) => ({
      key,
      year: Number(key),
      months: months.sort((a, b) => b.month - a.month),
    }))
    .sort((a, b) => b.year - a.year);

  return { years, markedDays };
}

/** Replace or drop a summary after autosave. Empty snippet removes the row. */
export function upsertDiarySummary(
  summaries: readonly DiarySummary[],
  next: DiarySummary,
): DiarySummary[] {
  const without = summaries.filter((row) => row.id !== next.id);
  if (next.snippet.trim() === "" || !next.noteDate) return without;
  return [...without, next];
}

/** The Journal leaf for a calendar day, if the tree is showing one. */
export function journalEntryOnDay(tree: DiaryTree, dateKey: string): DiaryEntry | null {
  const monthKey = dateKey.slice(0, 7);
  for (const year of tree.years) {
    for (const month of year.months) {
      if (month.key !== monthKey) continue;
      return (
        month.entries.find(
          (entry) => entry.dateKey === dateKey && entry.subject === JOURNAL_SUBJECT,
        ) ?? null
      );
    }
  }
  return null;
}
