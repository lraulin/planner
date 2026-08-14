import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueAccessToken } from "@/lib/oauth/tokens";
import { GET, POST } from "./route";

const originalKey = process.env.PLANNER_AGENT_API_KEY;

function request(body: unknown, token = "test-key") {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.PLANNER_AGENT_API_KEY = "test-key";
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.PLANNER_AGENT_API_KEY;
  else process.env.PLANNER_AGENT_API_KEY = originalKey;
});

describe("MCP HTTP boundary", () => {
  it("rejects a missing bearer key before JSON-RPC", async () => {
    const response = await POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
    expect(response.headers.get("www-authenticate")).toContain(
      "oauth-protected-resource",
    );
    expect(await response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("rejects a wrong key", async () => {
    const response = await POST(
      request({ jsonrpc: "2.0", id: 1, method: "initialize" }, "nope"),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "unauthorized", message: "Invalid API key" },
    });
  });

  it("rejects a non-OAuth bearer when the server key is unset", async () => {
    delete process.env.PLANNER_AGENT_API_KEY;
    const response = await POST(
      request({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("initializes and lists the MCP catalog", async () => {
    const init = await POST(
      request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {} },
      }),
    );
    expect(init.status).toBe(200);
    expect(await init.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "planner", version: "2" },
      },
    });

    const listed = await POST(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    expect(listed.status).toBe(200);
    const payload = (await listed.json()) as {
      result: { tools: { name: string }[] };
    };
    expect(payload.result.tools).toHaveLength(32);
    expect(payload.result.tools.map((tool) => tool.name)).not.toContain("list_tools");
  });

  it("accepts an OAuth access token issued for this MCP resource", async () => {
    const origin = (process.env.BETTER_AUTH_URL ?? "http://localhost").replace(
      /\/$/,
      "",
    );
    const token = issueAccessToken("user-1", `${origin}/api/mcp`);
    const response = await POST(
      request({ jsonrpc: "2.0", id: 9, method: "initialize" }, token),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { serverInfo: { name: "planner" } },
    });
  });

  it("returns 405 for GET and 400 for malformed JSON", async () => {
    const get = GET();
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");

    const malformed = await POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
          "content-type": "application/json",
        },
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: -32700 },
    });
  });
});
