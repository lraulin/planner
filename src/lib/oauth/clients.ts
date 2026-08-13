import { signClaims, verifyClaims } from "./tokens";
import { STATIC_CLIENT_ID } from "./origin";

export type ResolvedClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[] | "static-allowlist";
};

const CIMD_TIMEOUT_MS = 3000;

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function redirectHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

export function isStaticPlannerRedirect(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  const host = url.hostname.toLowerCase();
  if (url.protocol === "http:" && (host === "127.0.0.1" || host === "localhost")) {
    return true;
  }
  if (url.protocol !== "https:") return false;
  return (
    host === "grok.com" ||
    host.endsWith(".grok.com") ||
    host === "x.ai" ||
    host.endsWith(".x.ai")
  );
}

function isBlockedLookupHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") {
    return true;
  }
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return true;
  }
  if (host === "::1" || host.startsWith("[::1]") || host.startsWith("fe80")) {
    return true;
  }
  return false;
}

export function clientRedirectAllowed(
  client: ResolvedClient,
  redirectUri: string,
): boolean {
  if (client.redirectUris === "static-allowlist") {
    return isStaticPlannerRedirect(redirectUri);
  }
  return client.redirectUris.includes(redirectUri);
}

export function registerPublicClient(
  clientName: string,
  redirectUris: string[],
): ResolvedClient {
  const uris = redirectUris.filter((uri) => {
    try {
      const url = new URL(uri);
      if (url.hash) return false;
      if (url.protocol === "https:") return true;
      return (
        url.protocol === "http:" &&
        (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      );
    } catch {
      return false;
    }
  });
  if (uris.length === 0) {
    throw new Error("redirect_uris must include at least one https or localhost URI");
  }
  const clientId = signClaims({
    typ: "client",
    clientName: clientName.trim() || "MCP client",
    redirectUris: uris,
    iat: Math.floor(Date.now() / 1000),
  });
  return {
    clientId,
    clientName: clientName.trim() || "MCP client",
    redirectUris: uris,
  };
}

async function resolveClientIdMetadata(
  clientId: string,
): Promise<ResolvedClient | null> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || isBlockedLookupHost(url.hostname)) return null;

  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    client_id?: unknown;
    client_name?: unknown;
    redirect_uris?: unknown;
  };
  if (body.client_id !== clientId) return null;
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0)
    return null;
  const redirectUris = body.redirect_uris.filter(
    (uri): uri is string => typeof uri === "string",
  );
  if (redirectUris.length === 0) return null;
  return {
    clientId,
    clientName:
      typeof body.client_name === "string" && body.client_name.trim()
        ? body.client_name.trim()
        : "MCP client",
    redirectUris,
  };
}

export async function resolveClient(clientId: string): Promise<ResolvedClient | null> {
  if (!clientId) return null;
  if (clientId === STATIC_CLIENT_ID) {
    return {
      clientId: STATIC_CLIENT_ID,
      clientName: "Grok",
      redirectUris: "static-allowlist",
    };
  }
  const registered = verifyClaims(clientId, "client");
  if (registered) {
    return {
      clientId,
      clientName: registered.clientName,
      redirectUris: registered.redirectUris,
    };
  }
  if (isHttpsUrl(clientId)) {
    try {
      return await resolveClientIdMetadata(clientId);
    } catch {
      return null;
    }
  }
  return null;
}
