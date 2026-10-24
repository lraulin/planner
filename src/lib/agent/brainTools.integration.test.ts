import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createThoughtType } from "@/lib/brain/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { dispatchAgentTool } from "./tools";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("brain agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `brain-agent-${crypto.randomUUID()}@localhost`,
      name: "Brain Agent",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

type Linked = { id: string; name: string; label: string };
type Thought = {
  id: string;
  name: string;
  note: string;
  type: string | null;
  tags: string[];
  isHome: boolean;
  parents: Linked[];
  children: Linked[];
  jumps: Linked[];
  siblings: { id: string; name: string }[];
};
type Created = { thought: Thought; created: boolean };

describeDb("brain agent tools", () => {
  let userId: string;
  let otherId: string;

  const call = <T>(tool: string, args: Record<string, unknown>, as = userId) =>
    dispatchAgentTool(tool, args, as) as Promise<T>;

  beforeEach(async () => {
    userId = await makeUser();
    otherId = await makeUser();
  });

  it("creates a thought linked to another, and reads both neighbourhoods", async () => {
    const parent = await call<Created>("create_thought", { name: "Gardening" });
    const child = await call<Created>("create_thought", {
      name: "Tomatoes",
      note: "Needs staking",
      tags: ["fruit"],
      linkToId: parent.thought.id,
      relation: "parent",
      label: "grows",
    });
    expect(child.created).toBe(true);
    expect(child.thought.parents).toEqual([
      { id: parent.thought.id, name: "Gardening", label: "grows" },
    ]);
    expect(child.thought.tags).toEqual(["fruit"]);

    const read = await call<{ thought: Thought }>("get_thought", {
      id: parent.thought.id,
    });
    expect(read.thought.children.map((c) => c.name)).toEqual(["Tomatoes"]);
  });

  it("lists compactly, searches by note, and pages", async () => {
    await call("create_thought", { name: "Alpha", note: "contains zebra" });
    await call("create_thought", { name: "Beta" });

    const all = await call<{
      thoughts: { name: string; note?: string }[];
      pageInfo: { total: number; hasMore: boolean };
    }>("list_thoughts", { limit: 1 });
    expect(all.thoughts.map((t) => t.name)).toEqual(["Alpha"]);
    expect(all.thoughts[0]).not.toHaveProperty("note");
    expect(all.pageInfo).toMatchObject({ total: 2, hasMore: true });

    const found = await call<{ thoughts: { name: string }[] }>("list_thoughts", {
      query: "zebra",
    });
    expect(found.thoughts.map((t) => t.name)).toEqual(["Alpha"]);
  });

  it("replays an external id without a second thought", async () => {
    const args = { name: "Once", externalSource: "grok", externalId: "a" };
    const first = await call<Created>("create_thought", args);
    const second = await call<Created>("create_thought", args);
    expect(second.created).toBe(false);
    expect(second.thought.id).toBe(first.thought.id);
  });

  it("rejects a link target without its relation, and an unknown type before writing", async () => {
    const target = await call<Created>("create_thought", { name: "Target" });
    await expect(
      call("create_thought", { name: "X", linkToId: target.thought.id }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      call("create_thought", { name: "Typed", type: "Nonesuch" }),
    ).rejects.toMatchObject({ code: "validation" });
    const listed = await call<{ thoughts: unknown[] }>("list_thoughts", {
      query: "Typed",
    });
    expect(listed.thoughts).toEqual([]);
  });

  it("updates fields, types by name, Home, and clears them", async () => {
    await createThoughtType(userId, { name: "Person", color: 2 });
    const t = await call<Created>("create_thought", { name: "Ada" });

    const updated = await call<{ thought: Thought }>("update_thought", {
      id: t.thought.id,
      name: "Ada Lovelace",
      note: "Analyst",
      type: "person",
      tags: ["math"],
      home: true,
    });
    expect(updated.thought).toMatchObject({
      name: "Ada Lovelace",
      note: "Analyst",
      type: "Person",
      tags: ["math"],
      isHome: true,
    });

    const cleared = await call<{ thought: Thought }>("update_thought", {
      id: t.thought.id,
      type: null,
      home: false,
    });
    expect(cleared.thought).toMatchObject({
      type: null,
      isHome: false,
      name: "Ada Lovelace",
    });

    await expect(call("update_thought", { id: t.thought.id })).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      call("update_thought", { id: t.thought.id, name: "Changed", type: "Nonesuch" }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(
      (await call<{ thought: Thought }>("get_thought", { id: t.thought.id })).thought
        .name,
    ).toBe("Ada Lovelace");
  });

  it("links, relinks in place and unlinks", async () => {
    const a = await call<Created>("create_thought", { name: "A" });
    const b = await call<Created>("create_thought", { name: "B" });

    const linked = await call<{ thought: Thought }>("link_thoughts", {
      id: a.thought.id,
      otherId: b.thought.id,
      relation: "child",
    });
    expect(linked.thought.children.map((c) => c.name)).toEqual(["B"]);

    const flipped = await call<{ thought: Thought }>("link_thoughts", {
      id: a.thought.id,
      otherId: b.thought.id,
      relation: "jump",
    });
    expect(flipped.thought.children).toEqual([]);
    expect(flipped.thought.jumps.map((c) => c.name)).toEqual(["B"]);

    const unlinked = await call<{ thought: Thought }>("unlink_thoughts", {
      id: a.thought.id,
      otherId: b.thought.id,
    });
    expect(unlinked.thought.jumps).toEqual([]);
    await expect(
      call("link_thoughts", {
        id: a.thought.id,
        otherId: a.thought.id,
        relation: "jump",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("deletes a thought and its links", async () => {
    const a = await call<Created>("create_thought", { name: "A" });
    const b = await call<Created>("create_thought", {
      name: "B",
      linkToId: a.thought.id,
      relation: "parent",
    });
    expect(await call("delete_thought", { id: b.thought.id })).toEqual({
      deleted: true,
      id: b.thought.id,
    });
    await expect(call("get_thought", { id: b.thought.id })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(
      (await call<{ thought: Thought }>("get_thought", { id: a.thought.id })).thought
        .children,
    ).toEqual([]);
  });

  it("does not let a second user read, link to, change, or delete the first user's thoughts", async () => {
    const mine = await call<Created>("create_thought", {
      name: "Private",
      note: "secret",
    });
    const theirs = await call<Created>("create_thought", { name: "Theirs" }, otherId);

    expect(
      (await call<{ thoughts: unknown[] }>("list_thoughts", {}, otherId)).thoughts.map(
        (t) => (t as { name: string }).name,
      ),
    ).toEqual(["Theirs"]);
    expect(
      (
        await call<{ thoughts: unknown[] }>(
          "list_thoughts",
          { query: "secret" },
          otherId,
        )
      ).thoughts,
    ).toEqual([]);

    const notFound = { code: "not_found" };
    await expect(
      call("get_thought", { id: mine.thought.id }, otherId),
    ).rejects.toMatchObject(notFound);
    await expect(
      call("update_thought", { id: mine.thought.id, name: "Stolen" }, otherId),
    ).rejects.toMatchObject(notFound);
    await expect(
      call("delete_thought", { id: mine.thought.id }, otherId),
    ).rejects.toMatchObject(notFound);
    await expect(
      call(
        "link_thoughts",
        { id: theirs.thought.id, otherId: mine.thought.id, relation: "child" },
        otherId,
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      call(
        "create_thought",
        { name: "Sneaky", linkToId: mine.thought.id, relation: "child" },
        otherId,
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      call(
        "unlink_thoughts",
        { id: mine.thought.id, otherId: theirs.thought.id },
        otherId,
      ),
    ).rejects.toMatchObject(notFound);

    const still = await call<{ thought: Thought }>("get_thought", {
      id: mine.thought.id,
    });
    expect(still.thought).toMatchObject({
      name: "Private",
      note: "secret",
      children: [],
    });
  });
});
