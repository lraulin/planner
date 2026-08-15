/**
 * Thin Plaid client. The only impure part of `src/lib/plaid/` besides `sync.ts`.
 *
 * Plain `fetch` rather than the `plaid` package: we use six endpoints, and that dependency
 * is a large generated surface for the privilege. No client certificate is involved —
 * Plaid authenticates on `client_id` + `secret` in the request body, which is why this file
 * needs neither `node:https` nor an undici `Agent`.
 *
 * Deliberately untested, in the shape of `src/lib/google/client.ts`: everything that can be
 * decided without a network round trip lives in `mapping.ts`, which is pure and covered.
 */

import type { PlaidAccount, PlaidTransaction } from "./mapping";

/** Plaid environments. Sandbox costs nothing and never touches a real institution. */
export type PlaidEnvironment = "sandbox" | "production";

const HOSTS: Record<PlaidEnvironment, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

/**
 * The stored credentials are gone or the bank revoked the grant — Plaid's
 * `ITEM_LOGIN_REQUIRED` and its relatives.
 *
 * Distinct from a transient failure because the fix is different: the user has to
 * re-authenticate through Link, and no amount of retrying helps.
 *
 * **Carries no `code` property, deliberately.** `isInternalError` in
 * `src/lib/security/safeError.ts` redacts any error with a string `code` — which every Node
 * network failure has — so an error meant to reach the user must not look like one.
 */
export class PlaidReauthRequiredError extends Error {
  constructor(message = "This bank connection needs to be reconnected.") {
    super(message);
    this.name = "PlaidReauthRequiredError";
  }
}

/** The institution is down or Plaid cannot reach it. Transient; try again later. */
export class PlaidInstitutionDownError extends Error {
  constructor(message = "The bank is temporarily unavailable. Try again shortly.") {
    super(message);
    this.name = "PlaidInstitutionDownError";
  }
}

/**
 * Anything else: rate limits, 5xx, malformed responses, our own bad request.
 *
 * `errorCode` is Plaid's `error_code` string, kept for logs. Note this class *does* expose
 * a property named `errorCode` rather than `code`, so `safeError` does not mistake it for a
 * Postgres or Node error and blank the message.
 */
export class PlaidApiError extends Error {
  readonly status: number;
  readonly errorCode: string;
  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.name = "PlaidApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

/** Item errors that mean "send the user back through Link". */
const REAUTH_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "ITEM_LOCKED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
  "ACCESS_NOT_GRANTED",
]);

const DOWN_CODES = new Set([
  "INSTITUTION_DOWN",
  "INSTITUTION_NOT_RESPONDING",
  "INSTITUTION_NO_LONGER_SUPPORTED",
  "PRODUCT_NOT_READY",
]);

type PlaidCredentials = {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
};

/**
 * Credentials from the environment, failing closed.
 *
 * Shaped after `oauthSigningSecret()` in `src/lib/oauth/origin.ts`: a local accessor that
 * throws rather than a module-level constant, so an unconfigured deployment fails at the
 * call rather than at import time — and so `src/lib` stays free of a config module.
 *
 * The secret is chosen by environment so a sandbox key can never reach production data, or
 * the reverse.
 */
export function plaidCredentials(): PlaidCredentials {
  const environment: PlaidEnvironment =
    process.env.PLAID_ENV?.trim() === "production" ? "production" : "sandbox";

  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = (
    environment === "production"
      ? process.env.PLAID_SECRET_PRODUCTION
      : process.env.PLAID_SECRET_SANDBOX
  )?.trim();

  if (!clientId) throw new Error("PLAID_CLIENT_ID is not configured.");
  if (!secret) {
    throw new Error(
      `PLAID_SECRET_${environment === "production" ? "PRODUCTION" : "SANDBOX"} is not configured.`,
    );
  }
  return { clientId, secret, environment };
}

/** True when Plaid is configured at all, for hiding the Connect button rather than throwing. */
export function plaidConfigured(): boolean {
  try {
    plaidCredentials();
    return true;
  } catch {
    return false;
  }
}

type PlaidErrorBody = { error_code?: string; error_message?: string };

async function plaidFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { clientId, secret, environment } = plaidCredentials();

  const response = await fetch(`${HOSTS[environment]}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PlaidApiError(
      response.status,
      "NON_JSON_RESPONSE",
      `Plaid ${path} returned a non-JSON body (${response.status}).`,
    );
  }

  if (response.ok) return parsed;

  const { error_code: errorCode = "", error_message: errorMessage = "" } = (parsed ??
    {}) as PlaidErrorBody;

  if (REAUTH_CODES.has(errorCode)) throw new PlaidReauthRequiredError();
  if (DOWN_CODES.has(errorCode)) throw new PlaidInstitutionDownError();

  // The message deliberately does not include the request body — it holds the secret.
  throw new PlaidApiError(
    response.status,
    errorCode || "UNKNOWN",
    `Plaid ${path} ${response.status} ${errorCode}: ${errorMessage}`,
  );
}

/**
 * A short-lived token that initialises Link in the browser.
 *
 * `userId` is our own user id, which Plaid only echoes back; it never sees an email or a
 * name from us. Passing an existing `accessToken` puts Link in **update mode**, which
 * re-authenticates the connection the user already has instead of creating a second Item —
 * and Items are capped at 10 for the life of the Trial plan.
 */
export async function createLinkToken(
  userId: string,
  accessToken?: string,
): Promise<string> {
  const result = (await plaidFetch("/link/token/create", {
    client_name: "Planner",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: userId },
    // Omitted entirely in update mode: Plaid rejects `products` alongside `access_token`.
    ...(accessToken ? { access_token: accessToken } : { products: ["transactions"] }),
  })) as { link_token?: string };

  if (!result.link_token) {
    throw new PlaidApiError(200, "NO_LINK_TOKEN", "Plaid returned no link_token.");
  }
  return result.link_token;
}

export type ExchangedItem = { accessToken: string; itemId: string };

/** Trade Link's short-lived `public_token` for the long-lived access token. */
export async function exchangePublicToken(publicToken: string): Promise<ExchangedItem> {
  const result = (await plaidFetch("/item/public_token/exchange", {
    public_token: publicToken,
  })) as { access_token?: string; item_id?: string };

  if (!result.access_token || !result.item_id) {
    throw new PlaidApiError(200, "NO_ACCESS_TOKEN", "Plaid returned no access token.");
  }
  return { accessToken: result.access_token, itemId: result.item_id };
}

/** Accounts on an Item, with **cached** balances. For live balances use `getBalances`. */
export async function getAccounts(accessToken: string): Promise<PlaidAccount[]> {
  const result = (await plaidFetch("/accounts/get", { access_token: accessToken })) as {
    accounts?: PlaidAccount[];
  };
  return result.accounts ?? [];
}

/**
 * Accounts with **live** balances, fetched from the institution on this call.
 *
 * This is not interchangeable with `getAccounts`. That endpoint's `balances` object is
 * cached and refreshes about once a day, so using it for the headline balance would
 * reintroduce exactly the staleness this feature exists to remove.
 */
export async function getBalances(accessToken: string): Promise<PlaidAccount[]> {
  const result = (await plaidFetch("/accounts/balance/get", {
    access_token: accessToken,
  })) as { accounts?: PlaidAccount[] };
  return result.accounts ?? [];
}

export type SyncPage = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  nextCursor: string;
  hasMore: boolean;
};

/**
 * One page of transaction deltas since `cursor`.
 *
 * Pass `null` for the first call on an Item. The caller pages until `hasMore` is false and
 * persists the final cursor **in the same transaction as the rows** — a cursor only moves
 * forward, so advancing it separately would let a crash skip a page permanently.
 */
export async function syncTransactions(
  accessToken: string,
  cursor: string | null,
  count = 500,
): Promise<SyncPage> {
  const result = (await plaidFetch("/transactions/sync", {
    access_token: accessToken,
    ...(cursor ? { cursor } : {}),
    count,
  })) as {
    added?: PlaidTransaction[];
    modified?: PlaidTransaction[];
    removed?: { transaction_id: string }[];
    next_cursor?: string;
    has_more?: boolean;
  };

  return {
    added: result.added ?? [],
    modified: result.modified ?? [],
    removed: result.removed ?? [],
    nextCursor: result.next_cursor ?? cursor ?? "",
    hasMore: result.has_more ?? false,
  };
}

/**
 * Ask the institution for fresh transactions now, rather than waiting for Plaid's own
 * roughly-daily refresh.
 *
 * **Not supported by every institution** — Chase has `transactions_refresh`, Capital One
 * does not. Returns `false` when the institution declines rather than throwing, so a
 * refresh button can report "balance updated, transactions follow the bank's schedule"
 * instead of an error the user cannot act on.
 */
export async function refreshTransactions(accessToken: string): Promise<boolean> {
  try {
    await plaidFetch("/transactions/refresh", { access_token: accessToken });
    return true;
  } catch (error) {
    if (
      error instanceof PlaidApiError &&
      (error.errorCode === "PRODUCTS_NOT_SUPPORTED" ||
        error.errorCode === "INVALID_PRODUCT" ||
        error.errorCode === "PRODUCT_NOT_ENABLED")
    ) {
      return false;
    }
    throw error;
  }
}
