import { clientRedirectAllowed, resolveClient } from "@/lib/oauth/clients";
import { corsOptions, oauthError, corsJson } from "@/lib/oauth/http";
import { mcpResourceUrl, publicOrigin } from "@/lib/oauth/origin";
import { verifyS256 } from "@/lib/oauth/pkce";
import {
  issueAccessToken,
  issueRefreshToken,
  ACCESS_TTL_SEC,
  verifyClaims,
} from "@/lib/oauth/tokens";

export function OPTIONS() {
  return corsOptions();
}

async function readTokenParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  }
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text));
}

export async function POST(request: Request) {
  const origin = publicOrigin(request);
  const params = await readTokenParams(request);
  const grant = params.grant_type;

  if (grant === "refresh_token") {
    const refresh = verifyClaims(params.refresh_token ?? "", "rt");
    if (!refresh) {
      return oauthError("invalid_grant", "Refresh token is invalid or expired", 400);
    }
    const accessToken = issueAccessToken(refresh.sub, refresh.aud);
    const nextRefresh = issueRefreshToken(refresh.sub, refresh.aud);
    return corsJson({
      access_token: accessToken,
      refresh_token: nextRefresh,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SEC,
      scope: "planner",
    });
  }

  if (grant !== "authorization_code") {
    return oauthError(
      "unsupported_grant_type",
      "grant_type must be authorization_code",
    );
  }

  const code = verifyClaims(params.code ?? "", "code");
  if (!code) {
    return oauthError("invalid_grant", "Authorization code is invalid or expired");
  }
  if (params.redirect_uri !== code.redirectUri) {
    return oauthError(
      "invalid_grant",
      "redirect_uri does not match the authorization request",
    );
  }
  if (params.client_id && params.client_id !== code.clientId) {
    return oauthError("invalid_client", "client_id does not match", 401);
  }
  if (!verifyS256(params.code_verifier ?? "", code.challenge)) {
    return oauthError("invalid_grant", "PKCE verification failed");
  }

  const client = await resolveClient(code.clientId);
  if (!client || !clientRedirectAllowed(client, code.redirectUri)) {
    return oauthError("invalid_client", "Unknown client", 401);
  }

  const resource = (params.resource || code.resource || mcpResourceUrl(origin)).replace(
    /\/$/,
    "",
  );
  if (resource !== code.resource.replace(/\/$/, "")) {
    return oauthError(
      "invalid_target",
      "resource does not match the authorization request",
    );
  }

  return corsJson({
    access_token: issueAccessToken(code.sub, code.resource),
    refresh_token: issueRefreshToken(code.sub, code.resource),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SEC,
    scope: "planner",
  });
}
