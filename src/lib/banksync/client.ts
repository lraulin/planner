/**
 * Thin SimpleFIN client. The only impure part of `src/lib/banksync/` besides `sync.ts`.
 *
 * The whole protocol is two calls: exchange a one-time setup token for a long-lived access
 * URL, then `GET /accounts` against it. No SDK, no browser widget, no client certificate —
 * which is why this feature ships without a single third-party script in the page.
 *
 * Deliberately untested, in the shape of `src/lib/google/client.ts`: everything decidable
 * without a network round trip lives in `mapping.ts` and `syncPlan.ts`, which are pure.
 */

import type { SimpleFinAccountSet } from "./mapping";

/**
 * The access URL was revoked, or the setup token was already claimed. SimpleFIN answers 403.
 *
 * **Carries no `code` property, deliberately.** `isInternalError` in
 * `src/lib/security/safeError.ts` redacts any error with a string `code` — which every Node
 * network failure has — so an error meant to reach the user must not look like one.
 */
export class BankReauthRequiredError extends Error {
  constructor(message = "This bank connection needs to be set up again.") {
    super(message);
    this.name = "BankReauthRequiredError";
  }
}

/**
 * SimpleFIN answers 402 when the subscription has lapsed.
 *
 * Kept distinct from the reauth case on purpose: the remedy is paying, not reconnecting,
 * and telling someone to re-link when their card expired sends them round a loop that
 * cannot succeed.
 */
export class BankSubscriptionLapsedError extends Error {
  constructor(
    message = "The SimpleFIN subscription has lapsed. Renew it at simplefin.org to resume syncing.",
  ) {
    super(message);
    this.name = "BankSubscriptionLapsedError";
  }
}

/** Anything else: 5xx, malformed responses, network. Transient — leave the register alone. */
export class BankApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "BankApiError";
    this.status = status;
  }
}

/**
 * Split an access URL into its base and its embedded credentials.
 *
 * SimpleFIN hands back `scheme://user:pass@host/path`. Those credentials are sent as an
 * `Authorization` header rather than left in the request URL, because a URL travels into
 * error messages, proxy logs and stack traces in a way a header does not.
 */
function splitAccessUrl(accessUrl: string): { base: string; authorization: string } {
  let parsed: URL;
  try {
    parsed = new URL(accessUrl);
  } catch {
    throw new BankReauthRequiredError(
      "That bank connection is not a valid access URL.",
    );
  }
  const { username, password } = parsed;
  parsed.username = "";
  parsed.password = "";
  const base = parsed.toString().replace(/\/$/, "");
  const credentials = Buffer.from(
    `${decodeURIComponent(username)}:${decodeURIComponent(password)}`,
  ).toString("base64");
  return { base, authorization: `Basic ${credentials}` };
}

/**
 * Trade a one-time setup token for a permanent access URL.
 *
 * The token is base64 of a claim URL; claiming is a bare POST to it. **A token can only be
 * claimed once** — a second attempt answers 403, and SimpleFIN's own guidance is to treat
 * that as a possibly-compromised token rather than a retry. So the caller must persist the
 * result in the same operation that obtains it.
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  const trimmed = setupToken.trim();
  if (!trimmed) throw new BankReauthRequiredError("Paste the setup token first.");

  let claimUrl: string;
  try {
    claimUrl = Buffer.from(trimmed, "base64").toString("utf8").trim();
    if (!/^https:\/\//i.test(claimUrl)) throw new Error("not https");
  } catch {
    throw new BankReauthRequiredError(
      "That does not look like a SimpleFIN setup token. Copy the whole string from simplefin.org.",
    );
  }

  const response = await fetch(claimUrl, {
    method: "POST",
    headers: { "Content-Length": "0" },
    cache: "no-store",
    // A claim URL comes from user-pasted input, so a redirect could point anywhere.
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await response.text()).trim();

  if (response.status === 403) {
    throw new BankReauthRequiredError(
      "That setup token has already been used. Generate a new one at simplefin.org.",
    );
  }
  if (!response.ok) {
    throw new BankApiError(
      response.status,
      `SimpleFIN claim failed (${response.status}).`,
    );
  }
  if (!/^https?:\/\//i.test(body)) {
    throw new BankApiError(response.status, "SimpleFIN returned no access URL.");
  }
  return body;
}

export type FetchAccountsOptions = {
  /** Inclusive lower bound as a `YYYY-MM-DD` calendar day. */
  startDate?: string | null;
  /** Include unposted rows. Always true in practice; see the sync. */
  pending?: boolean;
  /** Skip transaction data entirely — a cheap balances-only read. */
  balancesOnly?: boolean;
};

const dayToEpoch = (key: string): number =>
  Math.floor(Date.parse(`${key}T00:00:00Z`) / 1000);

/**
 * Accounts, balances and transactions for a window.
 *
 * `pending=1` is not the default at SimpleFIN — omitting it silently drops unposted rows,
 * which would quietly remove the freshest information the feed carries.
 */
export async function fetchAccounts(
  accessUrl: string,
  options: FetchAccountsOptions = {},
): Promise<SimpleFinAccountSet> {
  const { base, authorization } = splitAccessUrl(accessUrl);

  const query = new URLSearchParams();
  if (options.startDate) query.set("start-date", String(dayToEpoch(options.startDate)));
  if (options.pending !== false) query.set("pending", "1");
  if (options.balancesOnly) query.set("balances-only", "1");

  const response = await fetch(`${base}/accounts?${query}`, {
    headers: { Authorization: authorization, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });

  if (response.status === 403) throw new BankReauthRequiredError();
  if (response.status === 402) throw new BankSubscriptionLapsedError();
  if (!response.ok) {
    // The URL is deliberately not in the message: it identifies the connection, and the
    // base half of it is still a secret worth not scattering through logs.
    throw new BankApiError(response.status, `SimpleFIN returned ${response.status}.`);
  }

  try {
    return (await response.json()) as SimpleFinAccountSet;
  } catch {
    throw new BankApiError(response.status, "SimpleFIN returned a non-JSON body.");
  }
}
