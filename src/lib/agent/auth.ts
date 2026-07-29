import { AgentError } from "./errors";

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

  const header = request.headers.get("authorization");
  if (!header) {
    throw new AgentError("unauthorized", "Missing Authorization header");
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new AgentError("unauthorized", "Authorization must be Bearer <token>");
  }

  const token = match[1].trim();
  if (token !== expected) {
    throw new AgentError("unauthorized", "Invalid API key");
  }
}
