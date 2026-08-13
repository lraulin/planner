import { clientRedirectAllowed, resolveClient, type ResolvedClient } from "./clients";
import { MCP_SCOPE, mcpResourceUrl, publicOrigin } from "./origin";

export type AuthorizeQuery = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string;
};

export type ParsedAuthorize =
  | { ok: true; query: AuthorizeQuery; client: ResolvedClient; resource: string }
  | { ok: false; message: string; redirectTo?: string };

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function readAuthorizeQuery(
  params: Record<string, string | string[] | undefined>,
): AuthorizeQuery {
  return {
    responseType: first(params.response_type),
    clientId: first(params.client_id),
    redirectUri: first(params.redirect_uri),
    state: first(params.state),
    codeChallenge: first(params.code_challenge),
    codeChallengeMethod: first(params.code_challenge_method),
    scope: first(params.scope),
    resource: first(params.resource),
  };
}

export async function parseAuthorizeRequest(
  params: Record<string, string | string[] | undefined>,
  origin = publicOrigin(),
): Promise<ParsedAuthorize> {
  const query = readAuthorizeQuery(params);
  if (query.responseType !== "code") {
    return { ok: false, message: "response_type must be code" };
  }
  if (!query.clientId) {
    return { ok: false, message: "client_id is required" };
  }
  if (!query.redirectUri) {
    return { ok: false, message: "redirect_uri is required" };
  }
  if (!query.codeChallenge || query.codeChallengeMethod !== "S256") {
    return { ok: false, message: "PKCE S256 code_challenge is required" };
  }

  const client = await resolveClient(query.clientId);
  if (!client) {
    return { ok: false, message: "Unknown client_id" };
  }
  if (!clientRedirectAllowed(client, query.redirectUri)) {
    return { ok: false, message: "redirect_uri is not registered for this client" };
  }

  const expectedResource = mcpResourceUrl(origin);
  const resource = query.resource || expectedResource;
  if (resource.replace(/\/$/, "") !== expectedResource.replace(/\/$/, "")) {
    return {
      ok: false,
      message: "resource must be this Planner MCP server",
      redirectTo: denyRedirect(query.redirectUri, query.state, "invalid_target"),
    };
  }

  if (query.scope && !query.scope.split(/\s+/).includes(MCP_SCOPE)) {
    return {
      ok: false,
      message: `scope must include ${MCP_SCOPE}`,
      redirectTo: denyRedirect(query.redirectUri, query.state, "invalid_scope"),
    };
  }

  return { ok: true, query, client, resource };
}

export function denyRedirect(
  redirectUri: string,
  state: string,
  error: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function codeRedirect(redirectUri: string, code: string, state: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}
