import { createHash, timingSafeEqual } from "node:crypto";
import { AgentError } from "./errors";

/**
 * Compare two secrets without letting the time taken say how much of the first one matched.
 *
 * `===` on strings stops at the first differing byte, so how long it takes is a function of
 * the shared prefix. That is only worth caring about because this key guards a write surface
 * (`/api/agent/*` creates and deletes nodes) and the roadmap points it at a public HTTPS
 * endpoint for remote MCP.
 *
 * Hashed first rather than compared directly: `timingSafeEqual` throws on unequal lengths, so
 * feeding it the raw values would need a length check that is itself an early return. SHA-256
 * makes both sides 32 bytes whatever was sent, so the key's length leaks nothing either.
 */
function secretsMatch(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
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

  const header = request.headers.get("authorization");
  if (!header) {
    throw new AgentError("unauthorized", "Missing Authorization header");
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new AgentError("unauthorized", "Authorization must be Bearer <token>");
  }

  const token = match[1].trim();
  if (!secretsMatch(token, expected)) {
    throw new AgentError("unauthorized", "Invalid API key");
  }
}
