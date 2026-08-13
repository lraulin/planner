import { NextResponse } from "next/server";
import { requireAgentApiKey } from "@/lib/agent/auth";
import { httpStatusFor, toAgentError } from "@/lib/agent/errors";
import {
  handleMcpHttpPayload,
  mcpParseError,
  WWW_AUTHENTICATE_BEARER,
} from "@/lib/agent/mcp";

/**
 * Remote MCP (Streamable HTTP, JSON only): POST /api/mcp
 *
 * Auth: Authorization: Bearer $PLANNER_AGENT_API_KEY
 * Protocol: JSON-RPC initialize / tools/list / tools/call over the agent registry.
 */

function authFailure(err: unknown): NextResponse {
  const agentErr = toAgentError(err);
  const headers =
    agentErr.code === "unauthorized"
      ? { "www-authenticate": WWW_AUTHENTICATE_BEARER }
      : undefined;
  return NextResponse.json(
    { error: { code: agentErr.code, message: agentErr.message } },
    { status: httpStatusFor(agentErr.code), headers },
  );
}

export async function POST(request: Request) {
  try {
    requireAgentApiKey(request);
  } catch (err) {
    return authFailure(err);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(mcpParseError(), { status: 400 });
  }

  const result = await handleMcpHttpPayload(payload);
  if (result.status === 202) {
    return new NextResponse(null, { status: 202 });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
