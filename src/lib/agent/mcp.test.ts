import { describe, expect, it } from "vitest";
import {
  handleMcpHttpPayload,
  handleMcpMessage,
  isMcpExposedTool,
  listMcpToolDefinitions,
  MCP_PROTOCOL_LATEST,
  MCP_SERVER_NAME,
  toMcpTool,
} from "./mcp";
import { TOOL_REGISTRY } from "./tools";

const HIDDEN = [
  "health",
  "list_tools",
  "describe_tool",
  "capture",
  "list_notes",
  "set_focus_area",
] as const;

const REQUIRED = [
  "get_context",
  "search_nodes",
  "get_node",
  "create_node",
  "capture_inbox",
  "update_node",
  "search_notes",
  "get_note",
  "create_note",
  "update_note",
  "get_week",
  "create_appointment",
  "update_appointment",
  "delete_appointment",
  "ensure_weekly_plan",
  "update_weekly_plan",
  "upsert_plan_entry",
  "update_weekly_plan_entries",
  "load_weekly_plan",
  "set_weekly_plan_completed",
  "list_metrics",
  "get_metric",
  "create_metric",
  "update_metric",
  "log_metric_entry",
  "update_metric_entry",
  "get_finance_overview",
  "get_cash_flow",
  "get_spending_breakdown",
  "list_recurring_bills",
  "get_debt_summary",
  "list_statements",
  "search_transactions",
  "list_commitments",
  "list_commitment_candidates",
  "upsert_subscription",
  "upsert_recurring_spend",
  "delete_commitment",
] as const;

describe("MCP catalog", () => {
  it("exposes the core and domain tools and hides discovery plus legacy", () => {
    const tools = listMcpToolDefinitions();
    const names = tools.map((tool) => tool.name);
    expect(names).toHaveLength(38);
    expect(names).toEqual(expect.arrayContaining([...REQUIRED]));
    for (const hidden of HIDDEN) {
      expect(names).not.toContain(hidden);
    }
    for (const tool of TOOL_REGISTRY.values()) {
      if (HIDDEN.includes(tool.name as (typeof HIDDEN)[number])) {
        expect(isMcpExposedTool(tool)).toBe(false);
      }
    }
  });

  it("publishes a selection description and a JSON Schema for each listed tool", () => {
    const listed = listMcpToolDefinitions().map(toMcpTool);
    for (const tool of listed) {
      expect(tool.description).toContain("Use when:");
      expect(tool.description).toContain("Avoid when:");
      expect(tool.description).toContain("Effects:");
      const schema = tool.inputSchema as {
        $schema?: string;
        type?: string;
        anyOf?: unknown;
      };
      expect(schema.$schema).toContain("json-schema.org");
      expect(schema.type === "object" || Array.isArray(schema.anyOf)).toBe(true);
    }
  });
});

describe("MCP JSON-RPC", () => {
  it("initializes with a negotiated protocol version and planner server info", async () => {
    const response = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {} },
    });
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: expect.objectContaining({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_NAME, version: "2" },
      }),
    });
    expect(
      (response as { result: { instructions: string } }).result.instructions,
    ).toContain("get_context");
    expect(
      (response as { result: { instructions: string } }).result.instructions,
    ).toContain("get_finance_overview");
  });

  it("falls back to the latest protocol when the client asks for an unknown one", async () => {
    const response = await handleMcpMessage({
      jsonrpc: "2.0",
      id: "init",
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    expect(response).toMatchObject({
      result: { protocolVersion: MCP_PROTOCOL_LATEST },
    });
  });

  it("acknowledges initialized and ping", async () => {
    await expect(
      handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }),
    ).resolves.toBeNull();
    await expect(
      handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "ping" }),
    ).resolves.toEqual({ jsonrpc: "2.0", id: 2, result: {} });
  });

  it("lists the same catalog tools/list will send to Grok", async () => {
    const response = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
    });
    const tools = (response as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools).toHaveLength(38);
    expect(tools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining([...HIDDEN]),
    );
  });

  it("returns an unknown-method JSON-RPC error", async () => {
    await expect(
      handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "prompts/list" }),
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: 4,
      error: { code: -32601, message: "Unknown method: prompts/list" },
    });
  });

  it("rejects a hidden or unknown tool without dispatching it", async () => {
    const hidden = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "capture", arguments: { text: "x" } },
    });
    expect(hidden).toEqual({
      jsonrpc: "2.0",
      id: 5,
      result: {
        content: [{ type: "text", text: "Unknown tool: capture" }],
        isError: true,
      },
    });

    const missing = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "no_such_tool", arguments: {} },
    });
    expect(missing).toMatchObject({
      result: { isError: true, content: [{ text: "Unknown tool: no_such_tool" }] },
    });
  });

  it("maps a validation failure to an MCP tool error with the field name", async () => {
    const response = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "get_context", arguments: { surprise: true } },
    });
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 7,
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: expect.stringContaining("Unknown field surprise"),
          },
        ],
      },
    });
  });

  it("returns 202 for a notification-only batch and 400 for an empty batch", async () => {
    await expect(
      handleMcpHttpPayload([{ jsonrpc: "2.0", method: "notifications/initialized" }]),
    ).resolves.toEqual({ status: 202, body: null });

    await expect(handleMcpHttpPayload([])).resolves.toMatchObject({
      status: 400,
      body: { error: { code: -32600 } },
    });
  });
});
