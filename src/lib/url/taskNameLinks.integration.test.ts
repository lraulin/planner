import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { nodeItems, nodes, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { captureItems } from "@/lib/capture/mutations";
import { parseCapture } from "@/lib/capture/parse";
import { createNode, renameNode } from "@/lib/tree/mutations";
import { promoteUrlsFromTaskName } from "./taskNameLinks";

/**
 * Integration tests for promoting URLs in task names to attachments.
 * Mocks `fetch` so title resolution is deterministic and offline-safe.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("task name URL links");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `url-task-${crypto.randomUUID()}@localhost`,
      name: "Test User",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

async function nodeName(userId: string, nodeId: string): Promise<string> {
  const [row] = await db
    .select({ name: nodes.name })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);
  return row?.name ?? "";
}

async function attachmentsOf(
  userId: string,
  nodeId: string,
): Promise<{ title: string; url: string }[]> {
  return db
    .select({ title: nodeItems.title, url: nodeItems.url })
    .from(nodeItems)
    .where(
      and(
        eq(nodeItems.userId, userId),
        eq(nodeItems.nodeId, nodeId),
        eq(nodeItems.kind, "attachment"),
      ),
    );
}

function mockTitleFetch(titleByUrl: Record<string, string | null>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const href = typeof input === "string" ? input : input.toString();
      const title = titleByUrl[href];
      if (title === null || title === undefined) {
        return Promise.resolve(new Response("nope", { status: 500 }));
      }
      return Promise.resolve(
        new Response(`<html><head><title>${title}</title></head></html>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    }),
  );
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("promoteUrlsFromTaskName", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates an attachment and rewrites a sole-URL task name on create", async () => {
    mockTitleFetch({ "https://example.com/a": "Example Alpha" });

    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "https://example.com/a",
    });

    expect(await nodeName(userId, id)).toBe("Example Alpha");
    expect(await attachmentsOf(userId, id)).toEqual([
      { title: "Example Alpha", url: "https://example.com/a" },
    ]);
  });

  it("keeps surrounding text when rewriting on rename", async () => {
    mockTitleFetch({ "https://example.com/docs": "The Docs" });

    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Untitled",
    });
    await renameNode(userId, id, "Read https://example.com/docs later");

    expect(await nodeName(userId, id)).toBe("Read The Docs later");
    expect(await attachmentsOf(userId, id)).toEqual([
      { title: "The Docs", url: "https://example.com/docs" },
    ]);
  });

  it("still attaches when title fetch fails and leaves the URL in the name", async () => {
    mockTitleFetch({ "https://example.com/fail": null });

    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "See https://example.com/fail",
    });

    expect(await nodeName(userId, id)).toBe("See https://example.com/fail");
    expect(await attachmentsOf(userId, id)).toEqual([
      { title: "", url: "https://example.com/fail" },
    ]);
  });

  it("does not duplicate an attachment when the same URL is renamed in again", async () => {
    mockTitleFetch({ "https://example.com/once": "Once" });

    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "https://example.com/once",
    });
    expect(await attachmentsOf(userId, id)).toHaveLength(1);

    await renameNode(userId, id, "Again https://example.com/once");
    expect(await attachmentsOf(userId, id)).toHaveLength(1);
    expect(await nodeName(userId, id)).toBe("Again Once");
  });

  it("attaches each distinct URL in a multi-URL name", async () => {
    mockTitleFetch({
      "https://a.example/x": "Alpha",
      "https://b.example/y": "Beta",
    });

    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "A https://a.example/x and https://b.example/y",
    });

    expect(await nodeName(userId, id)).toBe("A Alpha and Beta");
    const attached = await attachmentsOf(userId, id);
    expect(attached).toHaveLength(2);
    expect(attached.map((a) => a.url).sort()).toEqual([
      "https://a.example/x",
      "https://b.example/y",
    ]);
  });

  it("leaves project names with URLs alone", async () => {
    mockTitleFetch({ "https://example.com/proj": "Project Page" });

    const id = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "https://example.com/proj",
    });

    expect(await nodeName(userId, id)).toBe("https://example.com/proj");
    expect(await attachmentsOf(userId, id)).toEqual([]);
  });

  it("promotes URLs from quick capture (create with name)", async () => {
    mockTitleFetch({ "https://example.com/capture": "Captured Page" });

    const { nodeIds } = await captureItems({
      userId,
      items: parseCapture("https://example.com/capture"),
    });
    expect(nodeIds).toHaveLength(1);

    expect(await nodeName(userId, nodeIds[0])).toBe("Captured Page");
    expect(await attachmentsOf(userId, nodeIds[0])).toEqual([
      { title: "Captured Page", url: "https://example.com/capture" },
    ]);
  });

  it("will not promote URLs onto another user's task", async () => {
    mockTitleFetch({ "https://example.com/private": "Secret" });

    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Plain",
    });
    // Force a name with a URL without going through rename (which would promote as owner).
    await db
      .update(nodes)
      .set({ name: "https://example.com/private" })
      .where(and(eq(nodes.id, id), eq(nodes.userId, userId)));

    const other = await makeUser();
    await promoteUrlsFromTaskName(other, id);

    expect(await nodeName(userId, id)).toBe("https://example.com/private");
    expect(await attachmentsOf(userId, id)).toEqual([]);
    expect(await attachmentsOf(other, id)).toEqual([]);
  });
});
