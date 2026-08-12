import { describe, expect, it } from "vitest";
import { readJsonResponse } from "./readJson";

describe("readJsonResponse", () => {
  it("returns the parsed body when the server sent JSON", async () => {
    const res = new Response(JSON.stringify({ ok: true, created: 3 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(readJsonResponse(res)).resolves.toEqual({ ok: true, created: 3 });
  });

  it("names a 413 instead of throwing a JSON parse error", async () => {
    const res = new Response("Request Entity Too Large", { status: 413 });
    await expect(readJsonResponse(res)).rejects.toThrow(
      /larger than the server will accept/,
    );
  });

  it("does not surface Unexpected token when the body is plain text", async () => {
    const res = new Response("Request Entity Too Large", { status: 413 });
    await expect(readJsonResponse(res)).rejects.not.toThrow(/Unexpected token/);
  });

  it("includes status and a snippet for other non-JSON bodies", async () => {
    const res = new Response("<html>nope</html>", { status: 502 });
    await expect(readJsonResponse(res)).rejects.toThrow(/502/);
    await expect(
      readJsonResponse(new Response("<html>nope</html>", { status: 502 })),
    ).rejects.toThrow(/nope/);
  });
});
