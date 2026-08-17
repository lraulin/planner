import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { nodeItems, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "@/lib/tree/mutations";
import { ATTACH_KIND_REFUSAL, ATTACH_NO_LINK, attachUrlsToNode } from "./attachUrls";

/**
 * Integration tests for attaching clipboard URLs onto a project or task.
 * Mocks `fetch` so title resolution is deterministic and offline-safe.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("attach URLs from clipboard");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `attach-url-${crypto.randomUUID()}@localhost`,
      name: "Test User",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
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

describeDb("attachUrlsToNode", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("attaches a URL to a task and fills the page title", async () => {
    mockTitleFetch({ "https://example.com/a": "Example Alpha" });
    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Read later",
    });

    await expect(
      attachUrlsToNode(userId, id, "https://example.com/a"),
    ).resolves.toEqual({
      created: 1,
      urls: ["https://example.com/a"],
    });
    expect(await attachmentsOf(userId, id)).toEqual([
      { title: "Example Alpha", url: "https://example.com/a" },
    ]);
  });

  it("attaches a URL to a project", async () => {
    mockTitleFetch({ "https://example.com/proj": "Project Page" });
    const id = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Ship it",
    });

    await attachUrlsToNode(userId, id, "See https://example.com/proj");
    expect(await attachmentsOf(userId, id)).toEqual([
      { title: "Project Page", url: "https://example.com/proj" },
    ]);
  });

  it("still attaches when title fetch fails", async () => {
    mockTitleFetch({ "https://example.com/fail": null });
    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Broken",
    });

    await attachUrlsToNode(userId, id, "https://example.com/fail");
    expect(await attachmentsOf(userId, id)).toEqual([
      { title: "", url: "https://example.com/fail" },
    ]);
  });

  it("does not duplicate an already-attached URL", async () => {
    mockTitleFetch({ "https://example.com/once": "Once" });
    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Once",
    });

    await attachUrlsToNode(userId, id, "https://example.com/once");
    const second = await attachUrlsToNode(userId, id, "https://example.com/once");
    expect(second).toEqual({ created: 0, urls: [] });
    expect(await attachmentsOf(userId, id)).toHaveLength(1);
  });

  it("attaches each distinct URL in one clip", async () => {
    mockTitleFetch({
      "https://a.example/x": "Alpha",
      "https://b.example/y": "Beta",
    });
    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Two links",
    });

    await attachUrlsToNode(userId, id, "A https://a.example/x and https://b.example/y");
    const attached = await attachmentsOf(userId, id);
    expect(attached).toHaveLength(2);
    expect(attached.map((row) => row.url).sort()).toEqual([
      "https://a.example/x",
      "https://b.example/y",
    ]);
  });

  it("refuses a goal", async () => {
    const id = await createNode({
      userId,
      parentId: null,
      type: "goal",
      name: "A goal",
    });
    await expect(attachUrlsToNode(userId, id, "https://example.com/a")).rejects.toThrow(
      ATTACH_KIND_REFUSAL,
    );
    expect(await attachmentsOf(userId, id)).toEqual([]);
  });

  it("refuses empty clipboard text", async () => {
    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Plain",
    });
    await expect(attachUrlsToNode(userId, id, "hello")).rejects.toThrow(ATTACH_NO_LINK);
    expect(await attachmentsOf(userId, id)).toEqual([]);
  });

  it("will not attach to another user's node", async () => {
    mockTitleFetch({ "https://example.com/private": "Secret" });
    const id = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Private",
    });
    const other = await makeUser();

    await expect(
      attachUrlsToNode(other, id, "https://example.com/private"),
    ).rejects.toThrow(`Node not found: ${id}`);
    expect(await attachmentsOf(userId, id)).toEqual([]);
    expect(await attachmentsOf(other, id)).toEqual([]);
  });

  it("treats a missing id the same as another user's", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    await expect(
      attachUrlsToNode(userId, missing, "https://example.com/a"),
    ).rejects.toThrow(`Node not found: ${missing}`);
  });
});
