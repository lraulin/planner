"use server";

import { revalidatePath } from "next/cache";
import {
  createLinkToken,
  exchangePublicToken,
  getAccounts,
  plaidConfigured,
} from "@/lib/plaid/client";
import { accountKindOf, linkCandidates } from "@/lib/plaid/mapping";
import {
  deleteItem,
  linkAccount,
  saveItem,
  unlinkAccount,
} from "@/lib/plaid/mutations";
import { linkableAccounts, listLinks, loadItemsForSync } from "@/lib/plaid/queries";
import { syncAll, type SyncResult } from "@/lib/plaid/sync";
import {
  run,
  runQuery,
  runWithData,
  type ActionResult,
  type DataActionResult,
  type QueryResult,
} from "../actionResult";

/**
 * Bank-connection actions. Thin, in the shape of `actions.ts` beside this file: resolve the
 * user, delegate to `src/lib/plaid`, return `{ ok }` rather than throwing.
 *
 * Kept in its own file rather than added to `actions.ts` because that one deliberately
 * passes `revalidate: []` for settings writes the client already applied optimistically.
 * These change server-rendered data — balances, row counts, connection state — so they do
 * revalidate, and mixing the two conventions in one file is how the wrong one gets copied.
 *
 * **No access token crosses this boundary.** `openLinkAction` returns a short-lived link
 * token, which is what the browser is supposed to hold; the long-lived access token is
 * exchanged server-side and never leaves.
 */

/**
 * A link token for a fresh connection, or null when Plaid is not configured.
 *
 * `runQuery`, not `runWithData`: the latter reports a bare string as `id` rather than
 * `data`, which would arrive at the client under the wrong name. Nothing is written here
 * anyway — Plaid mints the token and we hand it straight on.
 */
export async function openLinkAction(): Promise<QueryResult<string | null>> {
  return runQuery(async (userId) => {
    if (!plaidConfigured()) return null;
    return createLinkToken(userId);
  });
}

/**
 * A link token in **update mode** for an existing connection.
 *
 * This is the re-authentication path, and it matters for a reason beyond convenience: update
 * mode repairs the Item in place, where connecting afresh would mint a second one — and
 * Production Items are capped at 10 for the life of the Trial plan, with removal not
 * freeing a slot.
 */
export async function reconnectLinkAction(
  itemRowId: string,
): Promise<QueryResult<string | null>> {
  return runQuery(async (userId) => {
    if (!plaidConfigured()) return null;
    const items = await loadItemsForSync(userId);
    const item = items.find((candidate) => candidate.id === itemRowId);
    if (!item) throw new Error("Bank connection not found.");
    return createLinkToken(userId, item.accessToken);
  });
}

export type ExchangeResult = {
  itemRowId: string;
  /** Plaid accounts on this connection, each with the register accounts it might be. */
  accounts: {
    plaidAccountId: string;
    name: string;
    mask: string;
    type: string;
    subtype: string;
    /** Register account ids that match on last four, best first. */
    candidateIds: string[];
    /** Already-linked register account id, when re-running against a known connection. */
    linkedAccountId: string | null;
  }[];
  registerAccounts: { id: string; name: string; externalKey: string; kind: string }[];
};

/**
 * Trade Link's public token for an Item and describe what is on it.
 *
 * Deliberately does **not** link anything. Candidates are proposed by matching Plaid's mask
 * against `external_key`, and the user confirms each one — a wrong auto-link merges two real
 * accounts and is near-impossible to unpick afterwards.
 */
export async function exchangeAction(
  publicToken: string,
  institution: { id?: string; name?: string } = {},
): Promise<DataActionResult<ExchangeResult>> {
  return runWithData(async (userId) => {
    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    const itemRowId = await saveItem(userId, {
      itemId,
      accessToken,
      institutionId: institution.id ?? "",
      institutionName: institution.name ?? "",
    });

    const [plaidAccounts, registerAccounts, existingLinks] = await Promise.all([
      getAccounts(accessToken),
      linkableAccounts(userId),
      listLinks(userId, itemRowId),
    ]);
    const linkedByPlaidAccount = new Map(
      existingLinks.map((link) => [link.plaidAccountId, link.accountId]),
    );

    return {
      itemRowId,
      registerAccounts,
      accounts: plaidAccounts.map((account) => ({
        plaidAccountId: account.account_id,
        name: account.name,
        mask: account.mask ?? "",
        type: account.type,
        subtype: account.subtype ?? "",
        candidateIds: linkCandidates(account, registerAccounts),
        linkedAccountId: linkedByPlaidAccount.get(account.account_id) ?? null,
        kind: accountKindOf(account),
      })),
    };
  });
}

export async function linkAccountAction(input: {
  itemRowId: string;
  plaidAccountId: string;
  accountId: string;
  plaidType?: string;
  plaidSubtype?: string;
}): Promise<ActionResult> {
  return run(async (userId) => {
    await linkAccount(userId, input);
  });
}

export async function unlinkAccountAction(linkId: string): Promise<ActionResult> {
  return run(async (userId) => {
    await unlinkAccount(userId, linkId);
  });
}

export async function deleteItemAction(itemRowId: string): Promise<ActionResult> {
  return run(async (userId) => {
    await deleteItem(userId, itemRowId);
  });
}

/**
 * Refresh every connection.
 *
 * Returns the per-item statuses rather than a boolean: one bank can succeed while another
 * needs reconnecting, and a refresh that reports only "done" would hide that.
 */
export async function syncAction(): Promise<DataActionResult<SyncResult>> {
  return runWithData(async (userId) => {
    const result = await syncAll(userId);
    // The register and its balances are server-rendered, so the next navigation must not
    // serve a cached copy of what this just changed.
    revalidatePath("/", "layout");
    return result;
  });
}
