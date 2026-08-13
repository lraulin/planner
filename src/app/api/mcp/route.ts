import { NextResponse } from "next/server";
import { httpStatusFor, toAgentError } from "@/lib/agent/errors";
import { handleMcpHttpPayload, mcpParseError } from "@/lib/agent/mcp";
import { requireMcpAuth } from "@/lib/oauth/bearer";
import { wwwAuthenticateChallenge } from "@/lib/oauth/metadata";
import { publicOrigin } from "@/lib/oauth/origin";

/**
 * Remote MCP (Streamable HTTP, JSON only): POST /api/mcp
 *
 * Auth: Bearer $PLANNER_AGENT_API_KEY or an OAuth access token from /oauth/authorize.
 * Protocol: JSON-RPC initialize / tools/list / tools/call over the agent registry.
 */

function authFailure(err: unknown, origin: string): NextResponse {
  const agentErr = toAgentError(err);
  const headers =
    agentErr.code === "unauthorized"
      ? { "www-authenticate": wwwAuthenticateChallenge(origin) }
      : undefined;
  return NextResponse.json(
    { error: { code: agentErr.code, message: agentErr.message } },
    { status: httpStatusFor(agentErr.code), headers },
  );
}

export async function POST(request: Request) {
  const origin = publicOrigin(request);
  let auth;
  try {
    auth = requireMcpAuth(request, origin);
  } catch (err) {
    return authFailure(err, origin);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(mcpParseError(), { status: 400 });
  }

  const result = await handleMcpHttpPayload(
    payload,
    auth.via === "oauth" ? auth.userId : undefined,
  );
  if (result.status === 202) {
    return new NextResponse(null, { status: 202 });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
