import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import { db } from "@/db";
import { nodeItems } from "@/db/schema";

/**
 * Stub `fetch` as a web that serves only the given pages, each a `<title>` and nothing
 * else; a URL mapped to null, or not listed, answers 500. Title resolution under test is
 * then deterministic and offline. Pair with `vi.unstubAllGlobals()` in `afterEach`.
 */
export function mockTitleFetch(titleByUrl: Record<string, string | null>) {
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

/** A node's attachment rows as stored, for asserting what a URL write filed. */
export async function attachmentsOf(
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
