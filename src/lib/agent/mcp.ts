/** Stateless MCP Streamable HTTP adapter over the agent tool registry. */

import { toAgentError } from "./errors";
import {
  AGENT_CONTRACT_VERSION,
  agentJsonSchema,
  dispatchAgentTool,
  TOOL_REGISTRY,
  type AgentToolDefinition,
} from "./tools";

export const MCP_PROTOCOL_LATEST = "2025-03-26";
export const MCP_PROTOCOL_SUPPORTED = ["2025-03-26", "2024-11-05"] as const;
export const MCP_SERVER_NAME = "planner";
const HTTP_DISCOVERY_TOOLS = new Set(["health", "list_tools", "describe_tool"]);

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export type JsonRpcId = string | number | null;

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type McpTool = {
  name: string;
  description: string;
  inputSchema: object;
};

export function isMcpExposedTool(tool: AgentToolDefinition): boolean {
  return tool.exposure !== "legacy" && !HTTP_DISCOVERY_TOOLS.has(tool.name);
}

export function listMcpToolDefinitions(): AgentToolDefinition[] {
  return [...TOOL_REGISTRY.values()].filter(isMcpExposedTool);
}

export function mcpToolDescription(tool: AgentToolDefinition): string {
  const { kind, destructive, retry, confirmation } = tool.effects;
  return [
    tool.summary,
    `Use when: ${tool.useWhen}`,
    `Avoid when: ${tool.avoidWhen}`,
    `Returns: ${tool.returns}`,
    `Effects: ${kind}; destructive=${String(destructive)}; retry=${retry}; confirmation=${confirmation}`,
  ].join("\n");
}

export function toMcpTool(tool: AgentToolDefinition): McpTool {
  return {
    name: tool.name,
    description: mcpToolDescription(tool),
    inputSchema: agentJsonSchema(tool.inputSchema, true),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function asRequest(message: unknown): JsonRpcRequest | JsonRpcError {
  if (!isRecord(message)) {
    return { code: INVALID_REQUEST, message: "Request must be a JSON object" };
  }
  if (message.jsonrpc !== "2.0") {
    return { code: INVALID_REQUEST, message: 'jsonrpc must be "2.0"' };
  }
  if (typeof message.method !== "string" || message.method.length === 0) {
    return { code: INVALID_REQUEST, message: "method must be a non-empty string" };
  }
  const id = message.id;
  if (id !== undefined && !isJsonRpcId(id)) {
    return { code: INVALID_REQUEST, message: "id must be a string, number, or null" };
  }
  return {
    jsonrpc: "2.0",
    id,
    method: message.method,
    params: message.params,
  };
}

function resultResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id: JsonRpcId, error: JsonRpcError): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error };
}

function toolResult(data: unknown, isError = false) {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return {
    content: [{ type: "text" as const, text }],
    ...(isError || typeof data === "string" ? {} : { structuredContent: data }),
    isError,
  };
}

function toolError(message: string) {
  return toolResult(message, true);
}

function initializeResult(params: unknown) {
  const requested =
    isRecord(params) && typeof params.protocolVersion === "string"
      ? params.protocolVersion
      : MCP_PROTOCOL_LATEST;
  const protocolVersion = (MCP_PROTOCOL_SUPPORTED as readonly string[]).includes(
    requested,
  )
    ? requested
    : MCP_PROTOCOL_LATEST;

  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: {
      name: MCP_SERVER_NAME,
      version: String(AGENT_CONTRACT_VERSION),
    },
    instructions:
      "Planner personal planning tools. Start with get_context. For money questions start with get_finance_overview. For jobs, residences, or dated life facts use the history tools. Search before mutating and use ids from search or read results. Use capture_inbox for unprocessed ideas. Do not guess a parent or node id.",
  };
}

async function callTool(params: unknown, userId?: string): Promise<unknown> {
  if (!isRecord(params) || typeof params.name !== "string") {
    throw { jsonrpc: true, code: INVALID_PARAMS, message: "params.name is required" };
  }
  const name = params.name;
  const args = params.arguments === undefined ? {} : params.arguments;
  if (!isRecord(args)) {
    throw {
      jsonrpc: true,
      code: INVALID_PARAMS,
      message: "params.arguments must be an object",
    };
  }

  const tool = TOOL_REGISTRY.get(name as never);
  if (!tool || !isMcpExposedTool(tool)) {
    return toolError(`Unknown tool: ${name}`);
  }

  try {
    const data = await dispatchAgentTool(name, args, userId);
    return toolResult(data);
  } catch (error) {
    const agentError = toAgentError(error);
    return toolError(agentError.message);
  }
}

async function handleRequest(
  request: JsonRpcRequest,
  userId?: string,
): Promise<unknown> {
  switch (request.method) {
    case "initialize":
      return initializeResult(request.params);
    case "ping":
      return {};
    case "tools/list":
      return { tools: listMcpToolDefinitions().map(toMcpTool) };
    case "tools/call":
      return callTool(request.params, userId);
    default:
      throw {
        jsonrpc: true,
        code: METHOD_NOT_FOUND,
        message: `Unknown method: ${request.method}`,
      };
  }
}

function isJsonRpcCoded(
  error: unknown,
): error is { jsonrpc: true; code: number; message: string } {
  return (
    isRecord(error) &&
    error.jsonrpc === true &&
    typeof error.code === "number" &&
    typeof error.message === "string"
  );
}

/**
 * Handle one JSON-RPC message. Notifications (no id) return null — the HTTP layer
 * answers those with 202 and an empty body.
 */
export async function handleMcpMessage(
  message: unknown,
  userId?: string,
): Promise<JsonRpcResponse | null> {
  const parsed = asRequest(message);
  if ("code" in parsed) {
    return errorResponse(null, parsed);
  }
  const request = parsed;
  const isNotification = request.id === undefined;

  if (request.method === "notifications/initialized") {
    return null;
  }

  try {
    const result = await handleRequest(request, userId);
    if (isNotification) return null;
    return resultResponse(request.id as JsonRpcId, result);
  } catch (error) {
    if (isNotification) return null;
    const id = request.id as JsonRpcId;
    if (isJsonRpcCoded(error)) {
      return errorResponse(id, { code: error.code, message: error.message });
    }
    const agentError = toAgentError(error);
    return errorResponse(id, {
      code: INTERNAL_ERROR,
      message: agentError.message,
    });
  }
}

export type McpHttpResult =
  | { status: 202; body: null }
  | { status: 200; body: JsonRpcResponse | JsonRpcResponse[] }
  | { status: 400; body: JsonRpcResponse };

/** Parse a Streamable HTTP POST body (one message or a batch). */
export async function handleMcpHttpPayload(
  payload: unknown,
  userId?: string,
): Promise<McpHttpResult> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return {
        status: 400,
        body: errorResponse(null, {
          code: INVALID_REQUEST,
          message: "Batch must not be empty",
        }),
      };
    }
    const responses: JsonRpcResponse[] = [];
    for (const item of payload) {
      const response = await handleMcpMessage(item, userId);
      if (response) responses.push(response);
    }
    if (responses.length === 0) return { status: 202, body: null };
    return { status: 200, body: responses };
  }

  const response = await handleMcpMessage(payload, userId);
  if (response === null) return { status: 202, body: null };
  if (
    response.error?.code === PARSE_ERROR ||
    response.error?.code === INVALID_REQUEST
  ) {
    return { status: 400, body: response };
  }
  return { status: 200, body: response };
}

export function parseMcpJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export function mcpParseError(): JsonRpcResponse {
  return errorResponse(null, { code: PARSE_ERROR, message: "Parse error" });
}
