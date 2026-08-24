import { describe, expect, it } from "vitest";
import { inputSchemas, outputSchemas } from "./contracts";
import {
  AGENT_CONTRACT_VERSION,
  AGENT_TOOLS,
  dispatchAgentTool,
  TOOL_REGISTRY,
} from "./tools";

const UNUSED_USER_ID = "00000000-0000-4000-8000-000000000000";

describe("agent tool registry", () => {
  it("is the complete one-to-one inventory for schemas and dispatch", () => {
    expect([...TOOL_REGISTRY.keys()]).toEqual(AGENT_TOOLS);
    expect(Object.keys(inputSchemas)).toEqual(AGENT_TOOLS);
    expect(Object.keys(outputSchemas)).toEqual(AGENT_TOOLS);
    for (const tool of TOOL_REGISTRY.values()) {
      expect(tool.summary).not.toBe("");
      expect(tool.useWhen).not.toBe("");
      expect(tool.avoidWhen).not.toBe("");
      expect(tool.returns).not.toBe("");
      expect(tool.handler).toBeTypeOf("function");
    }
  });

  it("rejects an unknown top-level field instead of silently doing nothing", async () => {
    await expect(
      dispatchAgentTool(
        "update_node",
        { id: crypto.randomUUID(), statue: "completed" },
        UNUSED_USER_ID,
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining("Unknown field statue"),
    });
  });

  it("requires both halves of a retry key", async () => {
    await expect(
      dispatchAgentTool(
        "create_note",
        { title: "Imported", externalSource: "import" },
        UNUSED_USER_ID,
      ),
    ).rejects.toMatchObject({
      code: "validation",
      message: "externalSource and externalId must be provided together",
    });
  });

  it("returns only the ten preferred core tools by default", async () => {
    const result = (await dispatchAgentTool("list_tools", {}, UNUSED_USER_ID)) as {
      tools: { name: string }[];
    };
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "list_tools",
      "describe_tool",
      "get_context",
      "search_nodes",
      "get_node",
      "create_node",
      "capture_inbox",
      "update_node",
      "search_notes",
      "get_note",
    ]);
  });

  it("publishes the enforced schemas and compatibility metadata", async () => {
    const described = (await dispatchAgentTool(
      "describe_tool",
      { name: "create_node" },
      UNUSED_USER_ID,
    )) as {
      tool: {
        inputSchema: {
          $schema?: string;
          additionalProperties?: boolean;
          anyOf?: {
            additionalProperties?: boolean;
            properties?: Record<string, { description?: string }>;
          }[];
        };
        outputSchema: { $schema?: string };
      };
    };
    expect(described.tool.inputSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      anyOf: expect.arrayContaining([
        expect.objectContaining({ additionalProperties: false }),
      ]),
    });
    expect(described.tool.outputSchema.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    for (const branch of described.tool.inputSchema.anyOf ?? []) {
      for (const property of Object.values(branch.properties ?? {})) {
        expect(property.description).not.toBe("");
      }
    }

    const legacy = (await dispatchAgentTool(
      "list_tools",
      { domain: "outline", includeLegacy: true },
      UNUSED_USER_ID,
    )) as { tools: { name: string; replacedBy?: string }[] };
    expect(legacy.tools).toContainEqual(
      expect.objectContaining({ name: "capture", replacedBy: "capture_inbox" }),
    );

    const finances = (await dispatchAgentTool(
      "list_tools",
      { domain: "finances" },
      UNUSED_USER_ID,
    )) as { tools: { name: string; domain: string }[] };
    expect(finances.tools.map((tool) => tool.name)).toEqual([
      "get_finance_overview",
      "get_cash_flow",
      "get_spending_breakdown",
      "list_recurring_bills",
      "get_debt_summary",
      "list_statements",
      "search_transactions",
      "list_payees",
      "search_commitments",
      "find_commitment_candidates",
      "save_subscription",
      "set_commitment_payees",
    ]);
    expect(finances.tools.every((tool) => tool.domain === "finances")).toBe(true);

    const legacyFinances = (await dispatchAgentTool(
      "list_tools",
      { domain: "finances", includeLegacy: true },
      UNUSED_USER_ID,
    )) as { tools: { name: string; replacedBy?: string }[] };
    expect(legacyFinances.tools).toContainEqual(
      expect.objectContaining({
        name: "upsert_subscription",
        replacedBy: "save_subscription",
      }),
    );

    const history = (await dispatchAgentTool(
      "list_tools",
      { domain: "history" },
      UNUSED_USER_ID,
    )) as { tools: { name: string; domain: string }[] };
    expect(history.tools.map((tool) => tool.name)).toEqual([
      "list_jobs",
      "get_job",
      "create_job",
      "update_job",
      "list_residences",
      "get_residence",
      "create_residence",
      "update_residence",
      "list_life_events",
      "get_life_event",
      "create_life_event",
      "update_life_event",
    ]);
    expect(history.tools.every((tool) => tool.domain === "history")).toBe(true);
  });

  it("keeps health compatible while pointing to contract discovery", async () => {
    const health = (await dispatchAgentTool("health", {}, UNUSED_USER_ID)) as {
      status: string;
      tools: string[];
      contractVersion: number;
      discovery: { listTools: string; describeTool: string };
    };
    expect(health.status).toBe("ok");
    expect(health.tools).toEqual(AGENT_TOOLS);
    expect(health.contractVersion).toBe(AGENT_CONTRACT_VERSION);
    expect(health.discovery).toEqual({
      listTools: "list_tools",
      describeTool: "describe_tool",
    });
  });
});
