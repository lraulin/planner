"use server";

import { revalidatePath } from "next/cache";
import { claimSetupToken, fetchAccounts } from "@/lib/banksync/client";
import { institutionOf, linkCandidates } from "@/lib/banksync/mapping";
import {
  deleteConnection,
  linkAccount,
  renameConnection,
  replaceAccessUrl,
  saveConnection,
  unlinkAccount,
} from "@/lib/banksync/mutations";
import {
  linkableAccounts,
  listLinks,
  loadConnectionsForSync,
} from "@/lib/banksync/queries";
import { syncAll, type SyncResult } from "@/lib/banksync/sync";
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
 * user, delegate to `src/lib/banksync`, return `{ ok }` rather than throwing.
 *
 * Kept in its own file rather than added to `actions.ts` because that one deliberately
 * passes `revalidate: []` for settings writes the client already applied optimistically.
 * These change server-rendered data — balances, row counts, connection state — so they do
 * revalidate, and mixing the two conventions in one file is how the wrong one gets copied.
 *
 * **No access URL crosses this boundary.** It carries the credentials, so it is claimed and
 * stored server-side and never returned to the browser in any shape.
 */

export type ConnectResult = {
  connectionId: string;
  /** Provider accounts on this connection, each with the register accounts it might be. */
  accounts: {
    externalAccountId: string;
    name: string;
    institution: string;
    candidateIds: string[];
    linkedAccountId: string | null;
  }[];
  registerAccounts: { id: string; name: string; externalKey: string; kind: string }[];
};

async function describeConnection(
  userId: string,
  connectionId: string,
  accessUrl: string,
): Promise<ConnectResult> {
  const [set, registerAccounts, existingLinks] = await Promise.all([
    // Balances only: this is the matching screen, and pulling 90 days of transactions to
    // populate a dropdown would be slow for nothing.
    fetchAccounts(accessUrl, { balancesOnly: true, pending: false }),
    linkableAccounts(userId),
    listLinks(userId, connectionId),
  ]);
  const linkedByExternal = new Map(
    existingLinks.map((link) => [link.externalAccountId, link.accountId]),
  );

  return {
    connectionId,
    registerAccounts,
    accounts: (set.accounts ?? []).map((account) => ({
      externalAccountId: account.id,
      name: account.name,
      institution: institutionOf(account),
      candidateIds: linkCandidates(account, registerAccounts),
      linkedAccountId: linkedByExternal.get(account.id) ?? null,
    })),
  };
}

/**
 * Claim a setup token and describe what the connection holds.
 *
 * The claim and the write happen in one operation because **a setup token can only be
 * claimed once** — dropping the result between the two would mean generating a fresh token
 * at the provider rather than retrying.
 *
 * Deliberately does **not** link anything. Candidates are proposed by matching trailing
 * digits, and the user confirms each one: a wrong auto-link merges two real accounts and is
 * near-impossible to unpick afterwards.
 */
export async function connectAction(
  setupToken: string,
): Promise<DataActionResult<ConnectResult>> {
  return runWithData(async (userId) => {
    const accessUrl = await claimSetupToken(setupToken);
    const connectionId = await saveConnection(userId, { accessUrl });
    const described = await describeConnection(userId, connectionId, accessUrl);

    // Name the connection after the institutions it actually reaches. One SimpleFIN
    // connection can cover several banks, so "Chase, Capital One" says more than the
    // provider's name ever would — and the fallback label is the same for every row.
    const institutions = [
      ...new Set(described.accounts.map((a) => a.institution).filter(Boolean)),
    ];
    if (institutions.length > 0) {
      await renameConnection(userId, connectionId, institutions.join(", "));
    }
    return described;
  });
}

/**
 * Re-claim a fresh token for a connection that was revoked, keeping its account links.
 *
 * Distinct from connecting afresh: a new connection would leave the old links pointing at a
 * dead access URL and require matching every account again.
 */
export async function reconnectAction(
  connectionId: string,
  setupToken: string,
): Promise<DataActionResult<ConnectResult>> {
  return runWithData(async (userId) => {
    const accessUrl = await claimSetupToken(setupToken);
    await replaceAccessUrl(userId, connectionId, accessUrl);
    return describeConnection(userId, connectionId, accessUrl);
  });
}

/**
 * The accounts on a stored connection, for the matching screen. No re-claiming involved.
 *
 * Matching is a purely local decision about which register account a feed lands in, so
 * reaching it must not require a new setup token.
 */
export async function loadAccountsAction(
  connectionId: string,
): Promise<QueryResult<ConnectResult>> {
  return runQuery(async (userId) => {
    const connections = await loadConnectionsForSync(userId);
    const connection = connections.find((candidate) => candidate.id === connectionId);
    if (!connection) throw new Error("Bank connection not found.");
    return describeConnection(userId, connectionId, connection.accessUrl);
  });
}

export async function linkAccountAction(input: {
  connectionId: string;
  externalAccountId: string;
  accountId: string;
  institution?: string;
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

export async function deleteConnectionAction(
  connectionId: string,
): Promise<ActionResult> {
  return run(async (userId) => {
    await deleteConnection(userId, connectionId);
  });
}

/**
 * Refresh every connection.
 *
 * Returns the per-connection statuses rather than a boolean: one can succeed while another
 * needs re-setup, and a refresh that reports only "done" would hide that.
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
