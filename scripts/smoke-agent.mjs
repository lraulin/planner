#!/usr/bin/env node
/** Read-only smoke coverage for the live agent contract. */

const BASE = process.env.PLANNER_URL ?? "http://localhost:3047";
const API_KEY = process.env.PLANNER_AGENT_API_KEY?.trim();
const TIMEOUT_MS = 60_000;

if (!API_KEY) {
  console.error("smoke:agent requires PLANNER_AGENT_API_KEY");
  process.exit(1);
}

async function call(tool, body) {
  const response = await fetch(`${BASE}/api/agent/${tool}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, payload: await response.json() };
}

async function mcp(id, method, params) {
  const response = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, payload: await response.json() };
}

const checks = [
  {
    name: "health advertises contract discovery",
    run: async () => {
      const result = await call("health", {});
      return (
        result.status === 200 &&
        result.payload?.ok === true &&
        result.payload.data?.contractVersion === 2 &&
        result.payload.data?.discovery?.listTools === "list_tools"
      );
    },
  },
  {
    name: "default discovery is focused",
    run: async () => {
      const result = await call("list_tools", {});
      return (
        result.status === 200 &&
        result.payload?.ok === true &&
        result.payload.data?.tools?.length === 10
      );
    },
  },
  {
    name: "tool description publishes strict JSON Schema",
    run: async () => {
      const result = await call("describe_tool", { name: "search_nodes" });
      return (
        result.status === 200 &&
        result.payload?.data?.tool?.inputSchema?.additionalProperties === false
      );
    },
  },
  {
    name: "context read completes",
    run: async () => {
      const result = await call("get_context", {});
      return (
        result.status === 200 &&
        result.payload?.ok === true &&
        result.payload.data?.topOpenWorkInfo !== undefined
      );
    },
  },
  {
    name: "unknown fields are actionable validation errors",
    run: async () => {
      const result = await call("get_context", { surprise: true });
      return (
        result.status === 400 &&
        result.payload?.error?.code === "validation" &&
        result.payload.error.message.includes("Unknown field surprise")
      );
    },
  },
  {
    name: "OAuth discovery is public",
    run: async () => {
      const as = await fetch(`${BASE}/.well-known/oauth-authorization-server`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const prm = await fetch(`${BASE}/.well-known/oauth-protected-resource`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const asBody = await as.json();
      const prmBody = await prm.json();
      return (
        as.status === 200 &&
        prm.status === 200 &&
        typeof asBody.authorization_endpoint === "string" &&
        asBody.authorization_endpoint.endsWith("/oauth/authorize") &&
        typeof prmBody.resource === "string" &&
        prmBody.resource.endsWith("/api/mcp")
      );
    },
  },
  {
    name: "MCP initialize advertises the planner server",
    run: async () => {
      const result = await mcp(1, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
      });
      return (
        result.status === 200 &&
        result.payload?.result?.serverInfo?.name === "planner" &&
        result.payload.result.protocolVersion === "2025-03-26"
      );
    },
  },
  {
    name: "MCP tools/list is the 26-tool chat catalog",
    run: async () => {
      const result = await mcp(2, "tools/list");
      const names = result.payload?.result?.tools?.map((tool) => tool.name) ?? [];
      return (
        result.status === 200 &&
        names.length === 26 &&
        names.includes("get_context") &&
        names.includes("update_weekly_plan_entries") &&
        !names.includes("list_tools") &&
        !names.includes("capture")
      );
    },
  },
  {
    name: "MCP tools/call reads context",
    run: async () => {
      const result = await mcp(3, "tools/call", {
        name: "get_context",
        arguments: {},
      });
      const text = result.payload?.result?.content?.[0]?.text;
      if (result.status !== 200 || result.payload?.result?.isError) return false;
      const data = text ? JSON.parse(text) : result.payload?.result?.structuredContent;
      return data?.topOpenWorkInfo !== undefined;
    },
  },
];

console.log(`smoke:agent: ${checks.length} read-only checks against ${BASE}\n`);
let failed = 0;
for (const check of checks) {
  try {
    const ok = await check.run();
    console.log(`  ${ok ? "✓" : "✗"} ${check.name}`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${check.name} — ${error.message}`);
  }
}

if (failed > 0) {
  console.error(`\nsmoke:agent: ${failed} check${failed === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
console.log("\nsmoke:agent: all checks passed.");
