/** Public origin for OAuth metadata and resource indicators. */

export const MCP_SCOPE = "planner";
export const STATIC_CLIENT_ID = "planner";

export function publicOrigin(request?: Request): string {
  const fromEnv = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (request) return new URL(request.url).origin;
  return "http://localhost:3047";
}

export function mcpResourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

export function oauthSigningSecret(): string {
  const secret =
    process.env.BETTER_AUTH_SECRET?.trim() || process.env.PLANNER_AGENT_API_KEY?.trim();
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is not configured; cannot sign OAuth tokens");
  }
  return secret;
}
