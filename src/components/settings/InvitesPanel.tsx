"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { createInviteAction, revokeInviteAction } from "@/app/settings/actions";
import type { InviteListItem } from "@/lib/auth/invites";

export type { InviteListItem };

export function InvitesPanel({ initialInvites }: { initialInvites: InviteListItem[] }) {
  const [invites, setInvites] = useState(initialInvites);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  async function create() {
    setError(null);
    setPending(true);
    try {
      const result = await createInviteAction();
      if (!result.ok || !result.data) {
        setError(result.ok ? "Could not create the invite." : result.error);
        return;
      }
      setInvites((rows) => [result.data!, ...rows]);
    } finally {
      setPending(false);
    }
  }

  async function copy(invite: InviteListItem) {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopiedId(invite.id);
    } catch {
      setError("Could not copy the link.");
    }
  }

  async function confirmRevoke() {
    if (!revokeId) return;
    const id = revokeId;
    setRevokeId(null);
    const result = await revokeInviteAction(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInvites((rows) =>
      rows.map((row) =>
        row.id === id ? { ...row, revokedAt: new Date().toISOString() } : row,
      ),
    );
  }

  const revokeTarget = invites.find((row) => row.id === revokeId);

  return (
    <section className="border border-rule bg-surface">
      <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
        <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted">
          Invites
        </h2>
      </div>
      <div className="px-4 py-4">
        <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
          Share a link so someone can create their own empty planner. The same link
          works until you revoke it.
        </p>
        <button
          type="button"
          onClick={() => void create()}
          disabled={pending}
          className="mt-3 min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] font-medium text-ink hover:border-rule-strong hover:bg-surface-raised disabled:opacity-60 md:min-h-0"
        >
          {pending ? "Creating…" : "Create invite link"}
        </button>
        {error ? (
          <p className="mt-3 text-[0.8125rem] text-priority-a" role="alert">
            {error}
          </p>
        ) : null}
        {invites.length > 0 ? (
          <ul className="mt-4 divide-y divide-rule/70 border-t border-rule">
            {invites.map((invite) => {
              const revoked = Boolean(invite.revokedAt);
              return (
                <li
                  key={invite.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[0.75rem] text-ink">
                      {invite.url}
                    </p>
                    <p className="mt-1 text-[0.75rem] text-ink-faint">
                      {revoked
                        ? "Revoked"
                        : `${invite.useCount} ${invite.useCount === 1 ? "use" : "uses"}`}
                    </p>
                  </div>
                  {revoked ? null : (
                    <div className="flex flex-none gap-2">
                      <button
                        type="button"
                        onClick={() => void copy(invite)}
                        className="min-h-tap rounded border border-rule px-2.5 py-1 text-[0.8125rem] text-ink md:min-h-0"
                      >
                        {copiedId === invite.id ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevokeId(invite.id)}
                        className="min-h-tap rounded border border-rule px-2.5 py-1 text-[0.8125rem] text-priority-a md:min-h-0"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke this invite?"
        message="People who already created an account keep it. The link will not create new ones."
        confirmLabel="Revoke"
        destructive
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setRevokeId(null)}
      />
    </section>
  );
}
