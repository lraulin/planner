import { secretsMatch } from "@/lib/security/secretsMatch";
import { AgentError } from "./errors";

/**
 * Read the Bearer token from `Authorization`, or throw unauthorized.
 *
 * Shared by the agent API key check and MCP's API-key-or-OAuth gate so the header
 * grammar cannot drift between them.
 */
export function readBearerToken(request: Request): string {
  const header = request.headers.get("authorization");
  if (!header) {
    throw new AgentError("unauthorized", "Missing Authorization header");
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new AgentError("unauthorized", "Authorization must be Bearer <token>");
  }

  return match[1].trim();
}

/**
 * Verify the agent Bearer token from `PLANNER_AGENT_API_KEY`.
 *
 * Fail closed when the env var is missing — an open agent surface on a public URL would
 * be worse than a misconfigured local setup.
 */
export function requireAgentApiKey(request: Request): void {
  const expected = process.env.PLANNER_AGENT_API_KEY?.trim();
  if (!expected) {
    throw new AgentError(
      "internal",
      "PLANNER_AGENT_API_KEY is not configured on the server",
    );
  }

  const token = readBearerToken(request);
  if (!secretsMatch(token, expected)) {
    throw new AgentError("unauthorized", "Invalid API key");
  }
}
