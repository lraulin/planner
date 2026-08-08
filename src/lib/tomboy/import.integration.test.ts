import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes, users } from "@/db/schema";
import { deleteNote, updateNote } from "@/lib/notes/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importTomboyFiles, TOMBOY_SOURCE, TOMBOY_SUBJECT } from "./import";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("Tomboy import");

const createdUserIds: string[] = [];
const NOTE_ID = "651b3053-e904-4ab8-b18e-19267b053caf";

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

function noteFile(
  params: {
    id?: string;
    title?: string;
    body?: string;
    changed?: string;
    tags?: string[];
  } = {},
) {
  const id = params.id ?? NOTE_ID;
  const title = params.title ?? "Imported thought";
  const body = params.body ?? "Original body";
  const tags = (params.tags ?? ["system:notebook:Thoughts"])
    .map((tag) => `<tag>${tag}</tag>`)
    .join("");
  return {
    name: `${id}.note`,
    text: `<?xml version="1.0" encoding="utf-8"?>
<note version="0.3" xmlns:link="http://beatniksoftware.com/tomboy/link" xmlns:size="http://beatniksoftware.com/tomboy/size" xmlns="http://beatniksoftware.com/tomboy">
  <title>${title}</title>
  <text xml:space="preserve"><note-content version="0.1">${title}\n\n${body}</note-content></text>
  <last-change-date>${params.changed ?? "2017-09-21T17:53:52.1911579-04:00"}</last-change-date>
  <last-metadata-change-date>${params.changed ?? "2017-09-21T17:53:52.1911579-04:00"}</last-metadata-change-date>
  <create-date>2017-09-20T17:53:47.8812648-04:00</create-date>
  <tags>${tags}</tags>
</note>`,
  };
}

describeDb("importTomboyFiles", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates flat Tomboy notes with source timestamps and notebook contexts", async () => {
    const result = await importTomboyFiles({
      userId,
      files: [
        noteFile(),
        noteFile({
          id: "e2974bf6-7fd4-4915-b5c2-3ffca7d18cbe",
          title: "Template",
          tags: ["system:template", "system:notebook:Thoughts"],
        }),
      ],
    });

    expect(result).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 0,
      templatesSkipped: 1,
      invalidFiles: 0,
    });

    const [row] = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          eq(notes.externalSource, TOMBOY_SOURCE),
          eq(notes.externalId, NOTE_ID),
        ),
      );
    expect(row).toMatchObject({
      parentId: null,
      title: "Imported thought",
      subject: TOMBOY_SUBJECT,
      body: "Original body",
      noteDate: null,
      contexts: ["Thoughts"],
    });
    expect(row.createdAt.toISOString()).toBe("2017-09-20T21:53:47.881Z");
    expect(row.updatedAt.toISOString()).toBe("2017-09-21T21:53:52.191Z");
  });

  it("skips an exact re-import and updates the same row from a newer source note", async () => {
    await importTomboyFiles({ userId, files: [noteFile()] });

    const exact = await importTomboyFiles({ userId, files: [noteFile()] });
    expect(exact).toMatchObject({ created: 0, updated: 0, skipped: 1 });

    const newer = await importTomboyFiles({
      userId,
      files: [
        noteFile({
          body: "Changed in Tomboy",
          changed: "2018-01-02T12:00:00-05:00",
        }),
      ],
    });
    expect(newer).toMatchObject({ created: 0, updated: 1, skipped: 0 });

    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.externalId, NOTE_ID)));
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("Changed in Tomboy");
  });

  it("does not overwrite a Planner edit with an older Tomboy archive", async () => {
    await importTomboyFiles({ userId, files: [noteFile()] });
    const [row] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.externalId, NOTE_ID)));
    await updateNote(userId, row.id, { body: "Edited in Planner" });

    const result = await importTomboyFiles({
      userId,
      files: [noteFile({ body: "Stale archive copy" })],
    });

    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    const [kept] = await db
      .select({ body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.externalId, NOTE_ID)));
    expect(kept.body).toBe("Edited in Planner");
  });

  it("isolates the same Tomboy UUID and all note mutations between users", async () => {
    await importTomboyFiles({ userId, files: [noteFile()] });
    const [owner] = await db
      .select({ id: notes.id, body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.externalId, NOTE_ID)));
    const intruderId = await makeUser();

    const intruderRead = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, intruderId), eq(notes.externalId, NOTE_ID)));
    expect(intruderRead).toEqual([]);
    await expect(updateNote(intruderId, owner.id, { body: "Stolen" })).rejects.toThrow(
      "Note not found",
    );
    await expect(deleteNote(intruderId, owner.id)).rejects.toThrow("Note not found");

    const imported = await importTomboyFiles({
      userId: intruderId,
      files: [noteFile({ body: "Intruder's own copy" })],
    });
    expect(imported.created).toBe(1);

    const all = await db
      .select({ userId: notes.userId, body: notes.body })
      .from(notes)
      .where(eq(notes.externalId, NOTE_ID));
    expect(all).toEqual(
      expect.arrayContaining([
        { userId, body: "Original body" },
        { userId: intruderId, body: "Intruder's own copy" },
      ]),
    );
  });
});
