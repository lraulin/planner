import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode, deleteNode } from "@/lib/tree/mutations";
import {
  createNote,
  deleteNote,
  indentNote,
  moveNote,
  moveNoteVertically,
  outdentNote,
  setAllNotesCollapsed,
  setNoteCollapsed,
  updateNote,
} from "./mutations";
import { loadNotes, loadNotesForNode } from "./queries";

/**
 * Integration tests against the local Postgres (`npm run db:up`), following the harness in
 * `src/lib/schedule/mutations.integration.test.ts`. Each test works under its own user, so
 * these never touch seeded development data.
 *
 * The cross-user block is the point of this file as much as the happy paths: every mutation
 * here takes a `userId` and is expected to scope by it, and a dropped `userId` in a `where`
 * clause is both easy to write and invisible in single-user testing.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("notes mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

/** Titles in the order `loadNotes` returns them, with depth as leading dots. */
async function shape(userId: string): Promise<string[]> {
  const notes = await loadNotes(userId);
  return notes.map((note) => `${".".repeat(note.depth)}${note.title}`);
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("creating notes", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("defaults the subject to General and dates the note today", async () => {
    const id = await createNote({ userId });
    const [note] = await loadNotes(userId);

    expect(note.id).toBe(id);
    expect(note.subject).toBe("General");
    expect(note.noteDate).not.toBeNull();
    expect(note.flag).toBe("none");
    expect(note.contexts).toEqual([]);
  });

  it("appends to the end of the list by default", async () => {
    await createNote({ userId, values: { title: "First" } });
    await createNote({ userId, values: { title: "Second" } });

    expect(await shape(userId)).toEqual(["First", "Second"]);
  });

  it("inserts at an explicit position", async () => {
    const first = await createNote({ userId, values: { title: "First" } });
    await createNote({ userId, values: { title: "Last" } });
    await createNote({
      userId,
      position: { at: "after", siblingId: first },
      values: { title: "Middle" },
    });

    expect(await shape(userId)).toEqual(["First", "Middle", "Last"]);
  });

  it("nests a note under a parent", async () => {
    const parent = await createNote({ userId, values: { title: "Parent" } });
    await createNote({ userId, parentId: parent, values: { title: "Child" } });

    expect(await shape(userId)).toEqual(["Parent", ".Child"]);
  });

  it("marks a note with children so the grid can draw an expander", async () => {
    const parent = await createNote({ userId, values: { title: "Parent" } });
    await createNote({ userId, parentId: parent, values: { title: "Child" } });

    const [first, second] = await loadNotes(userId);
    expect(first.hasChildren).toBe(true);
    expect(first.childCount).toBe(1);
    expect(second.hasChildren).toBe(false);
  });
});

describeDb("editing notes", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("writes only the fields it is given", async () => {
    const id = await createNote({
      userId,
      values: { title: "Kept", subject: "Work", body: "original" },
    });

    await updateNote(userId, id, { body: "rewritten" });

    const [note] = await loadNotes(userId);
    expect(note.body).toBe("rewritten");
    expect(note.title).toBe("Kept");
    expect(note.subject).toBe("Work");
  });

  it("stores the body verbatim", async () => {
    // Two trailing spaces are a hard line break in markdown, so trimming the body would
    // silently change what the note renders as.
    const id = await createNote({ userId });
    await updateNote(userId, id, { body: "line one  \nline two\n" });

    const [note] = await loadNotes(userId);
    expect(note.body).toBe("line one  \nline two\n");
  });

  it("clears the linked node when passed null", async () => {
    const nodeId = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Health",
    });
    const id = await createNote({ userId, values: { nodeId } });

    await updateNote(userId, id, { nodeId: null });

    const [note] = await loadNotes(userId);
    expect(note.nodeId).toBeNull();
  });

  it("reports a missing note rather than silently doing nothing", async () => {
    await expect(
      updateNote(userId, crypto.randomUUID(), { title: "x" }),
    ).rejects.toThrow(/not found/i);
  });
});

describeDb("deleting notes", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("takes the whole subtree with it", async () => {
    const parent = await createNote({ userId, values: { title: "Parent" } });
    const child = await createNote({
      userId,
      parentId: parent,
      values: { title: "Child" },
    });
    await createNote({ userId, parentId: child, values: { title: "Grandchild" } });
    await createNote({ userId, values: { title: "Survivor" } });

    await deleteNote(userId, parent);

    expect(await shape(userId)).toEqual(["Survivor"]);
  });

  it("reports a missing note rather than silently doing nothing", async () => {
    await expect(deleteNote(userId, crypto.randomUUID())).rejects.toThrow(/not found/i);
  });
});

describeDb("linking a note to a record", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("reports the linked record's name and type", async () => {
    const nodeId = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Health",
    });
    await createNote({ userId, values: { title: "Note", nodeId } });

    const [note] = await loadNotes(userId);
    expect(note.nodeName).toBe("Health");
    expect(note.nodeType).toBe("result_area");
  });

  it("keeps the note when the linked record is deleted", async () => {
    // `set null`, not `cascade`: deleting a project must not silently destroy the notes
    // written about it.
    const nodeId = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Health",
    });
    await createNote({ userId, values: { title: "Survives", nodeId } });

    await deleteNode(userId, nodeId);

    const [note] = await loadNotes(userId);
    expect(note.title).toBe("Survives");
    expect(note.nodeId).toBeNull();
  });

  it("lists only the notes linked to one record", async () => {
    const health = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Health",
    });
    const work = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    await createNote({ userId, values: { title: "A", nodeId: health } });
    await createNote({ userId, values: { title: "B", nodeId: work } });
    await createNote({ userId, values: { title: "C" } });

    const linked = await loadNotesForNode(userId, health);
    expect(linked.map((n) => n.title)).toEqual(["A"]);
  });
});

describeDb("restructuring the note tree", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("indents a note under its previous sibling", async () => {
    await createNote({ userId, values: { title: "First" } });
    const second = await createNote({ userId, values: { title: "Second" } });

    await indentNote(userId, second);

    expect(await shape(userId)).toEqual(["First", ".Second"]);
  });

  it("refuses to indent the first note at its level", async () => {
    const first = await createNote({ userId, values: { title: "First" } });
    await expect(indentNote(userId, first)).rejects.toThrow(/first note/i);
  });

  it("outdents a note to sit after its old parent", async () => {
    const parent = await createNote({ userId, values: { title: "Parent" } });
    const child = await createNote({
      userId,
      parentId: parent,
      values: { title: "Child" },
    });
    await createNote({ userId, values: { title: "After" } });

    await outdentNote(userId, child);

    expect(await shape(userId)).toEqual(["Parent", "Child", "After"]);
  });

  it("refuses to outdent a top-level note", async () => {
    const note = await createNote({ userId, values: { title: "Top" } });
    await expect(outdentNote(userId, note)).rejects.toThrow(/top level/i);
  });

  it("refuses to move a note inside its own subtree", async () => {
    const parent = await createNote({ userId, values: { title: "Parent" } });
    const child = await createNote({
      userId,
      parentId: parent,
      values: { title: "Child" },
    });

    await expect(
      moveNote({ userId, noteId: parent, parentId: child, position: { at: "last" } }),
    ).rejects.toThrow(/inside itself/i);
  });

  it("swaps a note with its neighbour", async () => {
    await createNote({ userId, values: { title: "First" } });
    const second = await createNote({ userId, values: { title: "Second" } });

    await moveNoteVertically(userId, second, "up");

    expect(await shape(userId)).toEqual(["Second", "First"]);
  });

  it("treats moving past the end of a level as a no-op", async () => {
    const first = await createNote({ userId, values: { title: "First" } });
    await createNote({ userId, values: { title: "Second" } });

    await moveNoteVertically(userId, first, "up");

    expect(await shape(userId)).toEqual(["First", "Second"]);
  });
});

describeDb("collapsing notes", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("hides every descendant, not only direct children", async () => {
    const parent = await createNote({ userId, values: { title: "Parent" } });
    const child = await createNote({
      userId,
      parentId: parent,
      values: { title: "Child" },
    });
    await createNote({ userId, parentId: child, values: { title: "Grandchild" } });

    await setNoteCollapsed(userId, parent, true);

    const notes = await loadNotes(userId);
    expect(notes.map((n) => [n.title, n.hidden])).toEqual([
      ["Parent", false],
      ["Child", true],
      ["Grandchild", true],
    ]);
  });

  it("collapses everything at once", async () => {
    const parent = await createNote({ userId, values: { title: "Parent" } });
    await createNote({ userId, parentId: parent, values: { title: "Child" } });

    await setAllNotesCollapsed(userId, true);

    const notes = await loadNotes(userId);
    expect(notes.every((n) => n.collapsed)).toBe(true);
  });
});

describeDb("user isolation", () => {
  let owner: string;
  let intruder: string;
  let noteId: string;

  beforeEach(async () => {
    owner = await makeUser();
    intruder = await makeUser();
    noteId = await createNote({ userId: owner, values: { title: "Private" } });
  });

  it("does not show one user another's notes", async () => {
    expect(await loadNotes(intruder)).toEqual([]);
    expect(await loadNotes(owner)).toHaveLength(1);
  });

  it("does not let one user update another's note", async () => {
    await expect(updateNote(intruder, noteId, { title: "Hijacked" })).rejects.toThrow(
      /not found/i,
    );

    const [note] = await loadNotes(owner);
    expect(note.title).toBe("Private");
  });

  it("does not let one user delete another's note", async () => {
    await expect(deleteNote(intruder, noteId)).rejects.toThrow(/not found/i);
    expect(await loadNotes(owner)).toHaveLength(1);
  });

  it("does not let one user collapse another's note", async () => {
    await expect(setNoteCollapsed(intruder, noteId, true)).rejects.toThrow(
      /not found/i,
    );

    const [note] = await loadNotes(owner);
    expect(note.collapsed).toBe(false);
  });

  it("does not let a bulk collapse reach another user's notes", async () => {
    await setAllNotesCollapsed(intruder, true);

    const [note] = await loadNotes(owner);
    expect(note.collapsed).toBe(false);
  });

  it("does not let one user move another's note", async () => {
    await expect(
      moveNote({ userId: intruder, noteId, parentId: null, position: { at: "first" } }),
    ).rejects.toThrow(/not found/i);
  });

  it("does not let one user nest a note under another's note", async () => {
    // The parent id is valid; only the owner is wrong. Without the ownership check on the
    // parent this would silently graft a note into someone else's tree.
    await expect(
      createNote({ userId: intruder, parentId: noteId, values: { title: "Trespass" } }),
    ).rejects.toThrow(/not found/i);

    expect(await loadNotes(intruder)).toEqual([]);
  });

  it("does not let one user read another's notes for a record", async () => {
    const nodeId = await createNode({
      userId: owner,
      parentId: null,
      type: "result_area",
      name: "Health",
    });
    await updateNote(owner, noteId, { nodeId });

    expect(await loadNotesForNode(intruder, nodeId)).toEqual([]);
    expect(await loadNotesForNode(owner, nodeId)).toHaveLength(1);
  });
});
