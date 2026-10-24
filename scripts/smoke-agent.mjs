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
    // Two views of one registry must agree: MCP lists every tool HTTP discovery lists, less
    // the discovery pair itself. A literal count here went stale the first time a tool was
    // added and made this check fail for a reason that was not a regression.
    name: "MCP tools/list is every discoverable tool but the discovery pair",
    run: async () => {
      const result = await mcp(2, "tools/list");
      const names = result.payload?.result?.tools?.map((tool) => tool.name) ?? [];
      const discovered = await call("list_tools", { domain: "all" });
      const expected = (discovered.payload?.data?.tools ?? [])
        .map((tool) => tool.name)
        .filter((name) => name !== "health" && name !== "list_tools");
      return (
        result.status === 200 &&
        expected.length > 0 &&
        names.length === expected.length &&
        expected.every((name) => names.includes(name)) &&
        names.includes("get_context") &&
        names.includes("get_finance_overview") &&
        names.includes("search_transactions") &&
        names.includes("list_jobs") &&
        names.includes("create_life_event") &&
        names.includes("update_weekly_plan_entries") &&
        names.includes("create_house") &&
        !names.includes("list_tools") &&
        !names.includes("capture")
      );
    },
  },
  {
    name: "finance domain lists its tools",
    run: async () => {
      const result = await call("list_tools", { domain: "finances" });
      const names = result.payload?.data?.tools?.map((tool) => tool.name) ?? [];
      // The full listing is the other authority: the domain filter must return exactly the
      // tools it labels `finances`, so a tool added to the domain needs no edit here.
      const discovered = await call("list_tools", { domain: "all" });
      const labelled = (discovered.payload?.data?.tools ?? [])
        .filter((tool) => tool.domain === "finances")
        .map((tool) => tool.name);
      return (
        result.status === 200 &&
        result.payload?.ok === true &&
        names.length > 0 &&
        names.length === labelled.length &&
        labelled.every((name) => names.includes(name)) &&
        names.includes("get_finance_overview") &&
        names.includes("get_cash_flow") &&
        names.includes("search_transactions")
      );
    },
  },
  {
    name: "houses domain lists its five tools",
    run: async () => {
      const result = await call("list_tools", { domain: "houses" });
      const names = result.payload?.data?.tools?.map((tool) => tool.name) ?? [];
      return (
        result.status === 200 &&
        result.payload?.ok === true &&
        names.length === 5 &&
        names.includes("list_houses") &&
        names.includes("get_house") &&
        names.includes("create_house") &&
        names.includes("update_house") &&
        names.includes("delete_house")
      );
    },
  },
  {
    name: "brain domain lists its seven tools",
    run: async () => {
      const result = await call("list_tools", { domain: "brain" });
      const names = result.payload?.data?.tools?.map((tool) => tool.name) ?? [];
      return (
        result.status === 200 &&
        result.payload?.ok === true &&
        names.length === 7 &&
        names.includes("list_thoughts") &&
        names.includes("get_thought") &&
        names.includes("create_thought") &&
        names.includes("update_thought") &&
        names.includes("link_thoughts") &&
        names.includes("unlink_thoughts") &&
        names.includes("delete_thought")
      );
    },
  },
  {
    name: "finance overview reads",
    run: async () => {
      const result = await call("get_finance_overview", {});
      return (
        result.status === 200 &&
        result.payload?.ok === true &&
        Array.isArray(result.payload.data?.accounts) &&
        result.payload.data?.coverage !== undefined
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
