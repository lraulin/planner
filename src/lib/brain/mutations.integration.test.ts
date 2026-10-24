import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { brainLinks, brainThoughts, users } from "@/db/schema";
import { isCheckViolation, isUniqueViolation } from "@/lib/db/constraints";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { neighbourhood } from "./neighbourhood";
import {
  createThought,
  createThoughtType,
  deleteThought,
  deleteThoughtType,
  linkThoughts,
  markThoughtVisited,
  renameThought,
  setHomeThought,
  setLinkLabel,
  setThoughtNote,
  setThoughtTags,
  setThoughtType,
  unlinkThoughts,
} from "./mutations";
import {
  listTags,
  listTypes,
  loadPlex,
  recentThoughts,
  searchThoughts,
  startThoughtId,
} from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("brain mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `brain-test-${crypto.randomUUID()}@localhost`,
      name: "Brain Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

async function thought(userId: string, name: string, note = ""): Promise<string> {
  return (await createThought(userId, { name, note })).id;
}

async function linksOf(userId: string) {
  return db.select().from(brainLinks).where(eq(brainLinks.userId, userId));
}

describeDb("brain mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates a thought linked to an existing one in one step", async () => {
    const parent = await thought(userId, "Parent");
    const { id: child } = await createThought(userId, {
      name: "Child",
      linkTo: { thoughtId: parent, relation: "parent" },
    });
    const [link] = await linksOf(userId);
    expect(link).toMatchObject({ fromId: parent, toId: child, kind: "child" });
  });

  it("rolls the thought back when the link target does not exist", async () => {
    await expect(
      createThought(userId, {
        name: "Orphan",
        linkTo: { thoughtId: crypto.randomUUID(), relation: "jump" },
      }),
    ).rejects.toThrow("Thought not found");
    expect(await searchThoughts(userId, "Orphan")).toEqual([]);
  });

  it("replays an external id without a second thought", async () => {
    const input = { name: "Once", external: { source: "grok", id: "1" } };
    const first = await createThought(userId, input);
    const second = await createThought(userId, input);
    expect(second).toEqual({ id: first.id, created: false });
  });

  it("rejects an empty name", async () => {
    await expect(createThought(userId, { name: "   " })).rejects.toThrow();
  });

  describe("links", () => {
    it("keeps one row per pair: relinking flips direction and kind in place", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      const id = await linkThoughts(userId, a, "child", b);
      expect(await linkThoughts(userId, a, "parent", b)).toBe(id);
      expect(await linkThoughts(userId, b, "parent", a)).toBe(id);

      let rows = await linksOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ fromId: a, toId: b, kind: "child" });

      await linkThoughts(userId, a, "jump", b);
      rows = await linksOf(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0].kind).toBe("jump");
      expect(rows[0].fromId < rows[0].toId).toBe(true);
    });

    it("keeps the label when relinking without one, and replaces it when given", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      const id = await linkThoughts(userId, a, "child", b, "owns");
      await linkThoughts(userId, a, "jump", b);
      expect((await linksOf(userId))[0].label).toBe("owns");
      await setLinkLabel(userId, id, "  ");
      expect((await linksOf(userId))[0].label).toBe("");
    });

    it("refuses a self link", async () => {
      const a = await thought(userId, "A");
      await expect(linkThoughts(userId, a, "child", a)).rejects.toThrow();
    });

    it("allows a loop", async () => {
      const [a, b, c] = [
        await thought(userId, "A"),
        await thought(userId, "B"),
        await thought(userId, "C"),
      ];
      await linkThoughts(userId, a, "child", b);
      await linkThoughts(userId, b, "child", c);
      await linkThoughts(userId, c, "child", a);
      expect(await linksOf(userId)).toHaveLength(3);
    });

    it("unlinks whichever way round the pair is named", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      await linkThoughts(userId, a, "child", b);
      await unlinkThoughts(userId, b, a);
      expect(await linksOf(userId)).toEqual([]);
      await expect(unlinkThoughts(userId, a, b)).rejects.toThrow("Link not found");
    });

    it("deleting a thought removes its links but not its neighbours", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      await linkThoughts(userId, a, "child", b);
      await deleteThought(userId, a);
      expect(await linksOf(userId)).toEqual([]);
      expect((await loadPlex(userId, b))?.active.name).toBe("B");
    });
  });

  describe("schema constraints, bypassing the mutation layer", () => {
    it("rejects a second row for the same pair", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      await db.insert(brainLinks).values({ userId, fromId: a, toId: b, kind: "child" });
      const reversed = db
        .insert(brainLinks)
        .values({ userId, fromId: b, toId: a, kind: "child" });
      await expect(reversed).rejects.toSatisfy(isUniqueViolation);
    });

    it("rejects a jump stored in the wrong order", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      const [low, high] = a < b ? [a, b] : [b, a];
      const backwards = db
        .insert(brainLinks)
        .values({ userId, fromId: high, toId: low, kind: "jump" });
      await expect(backwards).rejects.toSatisfy(isCheckViolation);
    });

    it("rejects a link whose end belongs to another user", async () => {
      const other = await makeUser();
      const mine = await thought(userId, "Mine");
      const theirs = await thought(other, "Theirs");
      const crossed = db
        .insert(brainLinks)
        .values({ userId, fromId: mine, toId: theirs, kind: "child" });
      await expect(crossed).rejects.toThrow();
    });

    it("rejects a thought typed with another user's type", async () => {
      const other = await makeUser();
      const foreignType = await createThoughtType(other, { name: "Theirs", color: 1 });
      const mine = await thought(userId, "Mine");
      const crossed = db
        .update(brainThoughts)
        .set({ typeId: foreignType })
        .where(eq(brainThoughts.id, mine));
      await expect(crossed).rejects.toThrow();
    });
  });

  describe("home, visits and start", () => {
    it("has one Home at a time, and opens on it", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      await setHomeThought(userId, a);
      await setHomeThought(userId, b);
      expect((await loadPlex(userId, a))?.active.isHome).toBe(false);
      expect((await loadPlex(userId, b))?.active.isHome).toBe(true);
      expect(await startThoughtId(userId)).toBe(b);
      await setHomeThought(userId, null);
      expect((await loadPlex(userId, b))?.active.isHome).toBe(false);
    });

    it("opens on the most recently visited when there is no Home", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      await markThoughtVisited(userId, a);
      await new Promise((r) => setTimeout(r, 5));
      await markThoughtVisited(userId, b);
      expect(await startThoughtId(userId)).toBe(b);
      expect((await recentThoughts(userId)).map((t) => t.id)).toEqual([b, a]);
    });

    it("has nowhere to open when there are no thoughts", async () => {
      expect(await startThoughtId(userId)).toBeNull();
    });
  });

  describe("types and tags", () => {
    it("colours a thought through its type and clears it when the type goes", async () => {
      const t = await thought(userId, "T");
      const typeId = await createThoughtType(userId, { name: "Person", color: 3 });
      await setThoughtType(userId, t, typeId);
      expect((await loadPlex(userId, t))?.active.color).toBe(3);
      await deleteThoughtType(userId, typeId);
      const after = await loadPlex(userId, t);
      expect(after?.active.typeId).toBeNull();
      expect(after?.active.color).toBeNull();
      expect(await listTypes(userId)).toEqual([]);
    });

    it("rejects a colour outside the palette", async () => {
      await expect(
        createThoughtType(userId, { name: "X", color: 8 }),
      ).rejects.toThrow();
    });

    it("replaces tags, creating new ones and sharing existing ones", async () => {
      const a = await thought(userId, "A");
      const b = await thought(userId, "B");
      await setThoughtTags(userId, a, ["work", "idea", "work"]);
      await setThoughtTags(userId, b, ["idea"]);
      expect((await loadPlex(userId, a))?.active.tags).toEqual(["idea", "work"]);
      await setThoughtTags(userId, a, ["idea"]);
      expect((await loadPlex(userId, a))?.active.tags).toEqual(["idea"]);
      const counts = Object.fromEntries(
        (await listTags(userId)).map((t) => [t.name, t.thoughtCount]),
      );
      expect(counts).toEqual({ idea: 2, work: 0 });
    });
  });

  describe("loadPlex", () => {
    it("returns the links siblings need, and names for every neighbour", async () => {
      const parent = await thought(userId, "Parent");
      const me = await thought(userId, "Me");
      const sib = await thought(userId, "Sib");
      const kid = await thought(userId, "Kid");
      const far = await thought(userId, "Far");
      await linkThoughts(userId, me, "parent", parent);
      await linkThoughts(userId, sib, "parent", parent);
      await linkThoughts(userId, me, "child", kid);
      await linkThoughts(userId, kid, "child", far);

      const plex = await loadPlex(userId, me);
      expect(plex).not.toBeNull();
      const hood = neighbourhood(me, plex!.links);
      expect(hood.parents.map((p) => p.thoughtId)).toEqual([parent]);
      expect(hood.children.map((p) => p.thoughtId)).toEqual([kid]);
      expect(hood.siblings).toEqual([{ thoughtId: sib, viaParentId: parent }]);
      expect(Object.keys(plex!.thoughts).sort()).toEqual([parent, me, sib, kid].sort());
      expect(plex!.thoughts[sib].name).toBe("Sib");
    });

    it("flags which gates of each thought have links, counting only its own user's", async () => {
      const parent = await thought(userId, "Parent");
      const me = await thought(userId, "Me");
      const kid = await thought(userId, "Kid");
      const pal = await thought(userId, "Pal");
      await linkThoughts(userId, me, "parent", parent);
      await linkThoughts(userId, me, "child", kid);
      await linkThoughts(userId, pal, "jump", me);

      const { thoughts } = (await loadPlex(userId, me))!;
      expect(thoughts[me].gates).toEqual({
        parents: true,
        children: true,
        jumps: true,
      });
      // A jump is undirected: it fills the jump gate at both ends and no other gate.
      expect(thoughts[pal].gates).toEqual({
        parents: false,
        children: false,
        jumps: true,
      });
      expect(thoughts[parent].gates).toEqual({
        parents: false,
        children: true,
        jumps: false,
      });
      expect(thoughts[kid].gates).toEqual({
        parents: true,
        children: false,
        jumps: false,
      });
    });

    it("does not let another user's links fill a gate", async () => {
      const other = await makeUser();
      const mine = await thought(userId, "Mine");
      const theirs = await thought(other, "Theirs");
      await linkThoughts(other, theirs, "child", await thought(other, "T-kid"));
      const { thoughts } = (await loadPlex(userId, mine))!;
      expect(thoughts[mine].gates).toEqual({
        parents: false,
        children: false,
        jumps: false,
      });
      expect(await loadPlex(userId, theirs)).toBeNull();
    });

    it("is null for a thought that does not exist", async () => {
      expect(await loadPlex(userId, crypto.randomUUID())).toBeNull();
    });
  });

  describe("search", () => {
    it("finds by name before note, ignores case, and treats % literally", async () => {
      await thought(userId, "Gardening", "soil and seeds");
      await thought(userId, "Seeds", "");
      await thought(userId, "100% done", "");
      expect((await searchThoughts(userId, "seeds")).map((h) => h.name)).toEqual([
        "Seeds",
        "Gardening",
      ]);
      expect((await searchThoughts(userId, "%")).map((h) => h.name)).toEqual([
        "100% done",
      ]);
      expect(await searchThoughts(userId, "  ")).toEqual([]);
    });
  });

  describe("a second user", () => {
    let intruder: string;
    let ownerThought: string;
    let ownerOther: string;
    let ownerType: string;

    beforeEach(async () => {
      intruder = await makeUser();
      ownerThought = await thought(userId, "Owner secret", "owner note");
      ownerOther = await thought(userId, "Owner other");
      ownerType = await createThoughtType(userId, { name: "Owner type", color: 2 });
      await linkThoughts(userId, ownerThought, "child", ownerOther, "owner label");
      await setThoughtTags(userId, ownerThought, ["owner-tag"]);
      await setHomeThought(userId, ownerThought);
    });

    it("cannot read the first user's thoughts, links, types or tags", async () => {
      expect(await loadPlex(intruder, ownerThought)).toBeNull();
      expect(await searchThoughts(intruder, "owner")).toEqual([]);
      expect(await recentThoughts(intruder)).toEqual([]);
      expect(await startThoughtId(intruder)).toBeNull();
      expect(await listTypes(intruder)).toEqual([]);
      expect(await listTags(intruder)).toEqual([]);
    });

    it("cannot change them", async () => {
      await expect(renameThought(intruder, ownerThought, "Hacked")).rejects.toThrow();
      await expect(setThoughtNote(intruder, ownerThought, "Hacked")).rejects.toThrow();
      await expect(setThoughtTags(intruder, ownerThought, ["x"])).rejects.toThrow();
      await expect(setHomeThought(intruder, ownerThought)).rejects.toThrow();
      await expect(setThoughtType(intruder, ownerThought, null)).rejects.toThrow();
      await expect(
        setLinkLabel(intruder, (await linksOf(userId))[0].id, "Hacked"),
      ).rejects.toThrow();
      await expect(
        unlinkThoughts(intruder, ownerThought, ownerOther),
      ).rejects.toThrow();
      await markThoughtVisited(intruder, ownerThought);

      const mine = await thought(intruder, "Mine");
      await expect(setThoughtType(intruder, mine, ownerType)).rejects.toThrow();

      const plex = await loadPlex(userId, ownerThought);
      expect(plex?.active).toMatchObject({
        name: "Owner secret",
        note: "owner note",
        tags: ["owner-tag"],
        isHome: true,
        lastVisitedAt: null,
      });
      expect(plex?.links[0].label).toBe("owner label");
    });

    it("cannot link to, or create a thought linked to, the first user's thoughts", async () => {
      const mine = await thought(intruder, "Mine");
      await expect(
        linkThoughts(intruder, mine, "child", ownerThought),
      ).rejects.toThrow();
      await expect(
        linkThoughts(intruder, ownerThought, "child", mine),
      ).rejects.toThrow();
      await expect(
        createThought(intruder, {
          name: "Sneaky",
          linkTo: { thoughtId: ownerThought, relation: "child" },
        }),
      ).rejects.toThrow();
      expect(await linksOf(intruder)).toEqual([]);
      expect(await searchThoughts(intruder, "Sneaky")).toEqual([]);
      expect(await linksOf(userId)).toHaveLength(1);
    });

    it("cannot delete them", async () => {
      await expect(deleteThought(intruder, ownerThought)).rejects.toThrow();
      await expect(deleteThoughtType(intruder, ownerType)).rejects.toThrow();
      expect((await loadPlex(userId, ownerThought))?.active.name).toBe("Owner secret");
      expect(await listTypes(userId)).toHaveLength(1);
    });

    it("has its own Home, types and tag names that do not collide with the owner's", async () => {
      const mine = await thought(intruder, "Mine");
      await setHomeThought(intruder, mine);
      await createThoughtType(intruder, { name: "Owner type", color: 5 });
      await setThoughtTags(intruder, mine, ["owner-tag"]);
      expect(await startThoughtId(userId)).toBe(ownerThought);
      expect((await listTypes(userId))[0].color).toBe(2);
      expect(
        await db
          .select({ id: brainThoughts.id })
          .from(brainThoughts)
          .where(and(eq(brainThoughts.userId, userId), eq(brainThoughts.isHome, true))),
      ).toHaveLength(1);
    });
  });
});
