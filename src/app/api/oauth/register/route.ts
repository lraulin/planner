import { registerPublicClient } from "@/lib/oauth/clients";
import { corsJson, corsOptions, oauthError } from "@/lib/oauth/http";

export function OPTIONS() {
  return corsOptions();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Request body must be JSON");
  }

  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const redirectUris = Array.isArray(record.redirect_uris)
    ? record.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];
  const clientName =
    typeof record.client_name === "string" ? record.client_name : "MCP client";

  try {
    const client = registerPublicClient(clientName, redirectUris);
    return corsJson(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid client metadata";
    return oauthError("invalid_client_metadata", message);
  }
}
