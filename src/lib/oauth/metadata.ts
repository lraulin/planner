import { MCP_SCOPE, mcpResourceUrl, publicOrigin } from "./origin";

export function protectedResourceMetadata(origin = publicOrigin()) {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_SCOPE],
  };
}

export function authorizationServerMetadata(origin = publicOrigin()) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
    client_id_metadata_document_supported: true,
  };
}

export function wwwAuthenticateChallenge(origin = publicOrigin()): string {
  return `Bearer realm="planner", resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${MCP_SCOPE}"`;
}
