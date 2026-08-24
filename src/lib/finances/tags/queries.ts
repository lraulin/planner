import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeTags, financeTransactions } from "@/db/schema";
import { tagsInNotes } from "../tags";

export type FinanceTagRow = {
  id: string;
  tag: string;
  color: string | null;
  description: string;
  hidden: boolean;
  transactionCount: number;
};

/** Managed tag metadata plus current exact-token usage counts. */
export async function listFinanceTags(userId: string): Promise<FinanceTagRow[]> {
  const [managed, notes] = await Promise.all([
    db
      .select({
        id: financeTags.id,
        tag: financeTags.tag,
        color: financeTags.color,
        description: financeTags.description,
        hidden: financeTags.hidden,
      })
      .from(financeTags)
      .where(eq(financeTags.userId, userId))
      .orderBy(asc(financeTags.tag)),
    db
      .select({ notes: financeTransactions.notes })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId)),
  ]);

  const counts = new Map<string, number>();
  for (const row of notes) {
    for (const tag of tagsInNotes(row.notes)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return managed.map((tag) => ({
    ...tag,
    transactionCount: counts.get(tag.tag) ?? 0,
  }));
}

/** Every exact token currently used, including tokens with no managed metadata. */
export async function usedFinanceTags(userId: string): Promise<string[]> {
  const rows = await db
    .select({ notes: financeTransactions.notes })
    .from(financeTransactions)
    .where(eq(financeTransactions.userId, userId));
  return [...new Set(rows.flatMap((row) => tagsInNotes(row.notes)))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "case" }),
  );
}
