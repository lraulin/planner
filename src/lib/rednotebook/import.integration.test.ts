import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { loadDay } from "@/lib/day/queries";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { importRedNotebookFiles, REDNOTEBOOK_SUBJECT } from "./import";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("rednotebook import");

const makeUser = testUsers("test");

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

  it("creates flat notes with subject Rednotebook", async () => {
    const result = await importRedNotebookFiles({
      userId,
      files: [monthFile],
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);

    // Not Day journals — Day view journal pane stays empty.
    expect((await loadDay(userId, "2018-06-04", "2018-06-10")).journal).toBeNull();

    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.subject, REDNOTEBOOK_SUBJECT)));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.parentId === null)).toBe(true);

    const day4 = rows.find((r) => r.title === "2018-06-04");
    expect(day4?.body).toBe("Hello from RedNotebook");

    const day5 = rows.find((r) => r.title === "2018-06-05");
    expect(day5?.body).toContain("### Title");
    expect(day5?.body).toContain("*italic*");
    expect(day5?.contexts).toContain("tag1");
  });

  it("skips exact re-import and does not duplicate body", async () => {
    await importRedNotebookFiles({ userId, files: [monthFile] });
    const second = await importRedNotebookFiles({ userId, files: [monthFile] });

    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);
    expect(second.updated).toBe(0);

    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.subject, REDNOTEBOOK_SUBJECT)));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.title === "2018-06-04")?.body).toBe(
      "Hello from RedNotebook",
    );
  });

  it("treats a day imported with wrap artifacts as the same text, not a change", async () => {
    // Before the parser folded YAML line breaks, a wrapped entry was stored with the wrap and
    // its indentation in it. Re-importing the month must not read that as an edit and append.
    const [existing] = await db
      .insert(notes)
      .values({
        userId,
        title: "2018-06-04",
        subject: REDNOTEBOOK_SUBJECT,
        body: "one two\n    three",
        noteDate: new Date("2018-06-04T12:00:00Z"),
        sortKey: "m",
      })
      .returning({ id: notes.id });

    const result = await importRedNotebookFiles({
      userId,
      files: [{ name: "2018-06.txt", text: `4: {text: 'one two\n    three'}` }],
    });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    const [row] = await db.select().from(notes).where(eq(notes.id, existing.id));
    expect(row.body).toBe("one two\n    three");
  });

  it("appends when the same date already has different Rednotebook text", async () => {
    await importRedNotebookFiles({
      userId,
      files: [{ name: "2018-06.txt", text: `4: {text: 'First import'}` }],
    });
    const result = await importRedNotebookFiles({
      userId,
      files: [{ name: "2018-06.txt", text: `4: {text: 'Second pass'}` }],
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);

    const [row] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.subject, REDNOTEBOOK_SUBJECT),
          eq(notes.title, "2018-06-04"),
        ),
      );
    expect(row.body).toContain("First import");
    expect(row.body).toContain("Second pass");
    expect(row.body).toContain("---");
  });

  it("does not let a second user read or alter the first user's notes", async () => {
    await importRedNotebookFiles({ userId, files: [monthFile] });
    const intruder = await makeUser();

    const intruderView = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, intruder), eq(notes.subject, REDNOTEBOOK_SUBJECT)));
    expect(intruderView).toHaveLength(0);

    await importRedNotebookFiles({
      userId: intruder,
      files: [{ name: "2018-06.txt", text: `4: {text: 'Intruder day'}` }],
    });

    const [owner] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.subject, REDNOTEBOOK_SUBJECT),
          eq(notes.title, "2018-06-04"),
        ),
      );
    expect(owner.body).toBe("Hello from RedNotebook");

    const [other] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.userId, intruder),
          eq(notes.subject, REDNOTEBOOK_SUBJECT),
          eq(notes.title, "2018-06-04"),
        ),
      );
    expect(other.body).toBe("Intruder day");

    // Both users' root notes stay isolated (no shared parents).
    const ownerRoots = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), isNull(notes.parentId)));
    expect(ownerRoots.every((r) => r.userId === userId)).toBe(true);
  });
});
