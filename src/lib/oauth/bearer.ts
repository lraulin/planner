import { readBearerToken, requireAgentApiKey } from "@/lib/agent/auth";
import { AgentError } from "@/lib/agent/errors";
import { mcpResourceUrl, publicOrigin } from "./origin";
import { verifyClaims } from "./tokens";

export type McpAuth = { via: "api_key" } | { via: "oauth"; userId: string };

/**
 * Accept either the static agent API key or an OAuth access token issued for /api/mcp.
 */
export function requireMcpAuth(
  request: Request,
  origin = publicOrigin(request),
): McpAuth {
  const token = readBearerToken(request);

  if (token.startsWith("p1.")) {
    const access = verifyAccessToken(token, origin);
    if (access) return access;
    throw new AgentError("unauthorized", "Invalid access token");
  }

  if (process.env.PLANNER_AGENT_API_KEY?.trim()) {
    requireAgentApiKey(request);
    return { via: "api_key" };
  }

  throw new AgentError("unauthorized", "Invalid access token");
}

function verifyAccessToken(token: string, origin: string): McpAuth | null {
  try {
    const claims = verifyClaims(token, "at");
    if (!claims?.sub) return null;
    const expected = mcpResourceUrl(origin).replace(/\/$/, "");
    if (claims.aud.replace(/\/$/, "") !== expected) return null;
    return { via: "oauth", userId: claims.sub };
  } catch {
    return null;
  }
}
