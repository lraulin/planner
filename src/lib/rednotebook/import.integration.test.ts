import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notes, users } from "@/db/schema";
import { loadDay } from "@/lib/day/queries";
import { saveJournal } from "@/lib/day/mutations";
import { JOURNAL_SUBJECT } from "@/lib/day/types";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importRedNotebookFiles } from "./import";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("rednotebook import");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("importRedNotebookFiles", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  const monthFile = {
    name: "2018-06.txt",
    text: `4: {text: 'Hello from RedNotebook'}
5: {text: '=== Title ===

With //italic// and #tag1'}
`,
  };

  it("creates journal days under Journal / year / month", async () => {
    const result = await importRedNotebookFiles({
      userId,
      files: [monthFile],
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);

    const day = await loadDay(userId, "2018-06-04", "2018-06-10");
    expect(day.journal?.body).toBe("Hello from RedNotebook");

    const [dayNote] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.subject, JOURNAL_SUBJECT),
          eq(notes.title, "2018-06-04"),
        ),
      );
    expect(dayNote).toBeTruthy();
    expect(dayNote.parentId).not.toBeNull();

    const [month] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, dayNote.parentId!), eq(notes.userId, userId)));
    expect(month.title).toBe("2018-06");

    const [year] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, month.parentId!), eq(notes.userId, userId)));
    expect(year.title).toBe("2018");

    const [root] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, year.parentId!), eq(notes.userId, userId)));
    expect(root.title).toBe("Journal");
    expect(root.parentId).toBeNull();

    const day5 = await loadDay(userId, "2018-06-05", "2018-06-10");
    expect(day5.journal?.body).toContain("### Title");
    expect(day5.journal?.body).toContain("*italic*");

    const [tagged] = await db
      .select({ contexts: notes.contexts })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.subject, JOURNAL_SUBJECT),
          eq(notes.title, "2018-06-05"),
        ),
      );
    expect(tagged.contexts).toContain("tag1");
  });

  it("skips exact re-import and does not duplicate body", async () => {
    await importRedNotebookFiles({ userId, files: [monthFile] });
    const second = await importRedNotebookFiles({ userId, files: [monthFile] });

    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
    expect(second.updated).toBe(0);

    const journalRows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.subject, JOURNAL_SUBJECT)));
    expect(journalRows).toHaveLength(2);
    expect(journalRows.find((r) => r.title === "2018-06-04")?.body).toBe(
      "Hello from RedNotebook",
    );
  });

  it("appends when the day already has different journal text", async () => {
    await saveJournal(userId, "2018-06-04", "Written in planner");
    const result = await importRedNotebookFiles({
      userId,
      files: [
        {
          name: "2018-06.txt",
          text: `4: {text: 'From RedNotebook'}`,
        },
      ],
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);

    const day = await loadDay(userId, "2018-06-04", "2018-06-10");
    expect(day.journal?.body).toContain("Written in planner");
    expect(day.journal?.body).toContain("From RedNotebook");
    expect(day.journal?.body).toContain("---");
  });

  it("rehomes a legacy flat journal under the tree", async () => {
    // Simulate pre-hierarchy insert: root-level Journal note.
    await db.insert(notes).values({
      userId,
      parentId: null,
      sortKey: "a1",
      title: "2018-06-04",
      subject: JOURNAL_SUBJECT,
      body: "flat",
      noteDate: new Date(Date.UTC(2018, 5, 4, 12, 0, 0)),
    });

    await importRedNotebookFiles({
      userId,
      files: [
        {
          name: "2018-06.txt",
          text: `4: {text: 'flat'}`,
        },
      ],
    });

    const [row] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.subject, JOURNAL_SUBJECT),
          eq(notes.title, "2018-06-04"),
        ),
      );
    expect(row.parentId).not.toBeNull();

    const roots = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), isNull(notes.parentId)));
    expect(roots.some((r) => r.subject === JOURNAL_SUBJECT)).toBe(false);
  });

  it("does not let a second user read or alter the first user's journals", async () => {
    await importRedNotebookFiles({ userId, files: [monthFile] });
    const intruder = await makeUser();

    expect((await loadDay(intruder, "2018-06-04", "2018-06-10")).journal).toBeNull();

    await importRedNotebookFiles({
      userId: intruder,
      files: [
        {
          name: "2018-06.txt",
          text: `4: {text: 'Intruder day'}`,
        },
      ],
    });

    expect((await loadDay(userId, "2018-06-04", "2018-06-10")).journal?.body).toBe(
      "Hello from RedNotebook",
    );
    expect((await loadDay(intruder, "2018-06-04", "2018-06-10")).journal?.body).toBe(
      "Intruder day",
    );
  });
});
