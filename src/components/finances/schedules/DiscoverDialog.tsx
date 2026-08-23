"use client";

import { useId, useState, useTransition } from "react";
import { createDiscoveredSchedulesAction } from "@/app/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import { formatUsd } from "@/lib/finances/money";
import type { DiscoverProposal } from "@/lib/finances/schedules/discover";
import { useToday } from "@/components/grid/useToday";

export function DiscoverDialog({
  open,
  proposals,
  onClose,
  onCreated,
}: {
  open: boolean;
  proposals: DiscoverProposal[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const titleId = useId();
  const today = useToday() ?? "2026-01-01";
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(proposals.map((_, i) => i)),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  function toggle(index: number) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function confirm() {
    const selected = proposals.filter((_, index) => picked.has(index));
    if (selected.length === 0) {
      onClose();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createDiscoveredSchedulesAction(selected, today);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated();
      onClose();
    });
  }

  return (
    <ModalShell open={open} onClose={onClose} labelledBy={titleId} width="max-w-lg">
      <div className="flex flex-col gap-3 p-4">
        <h2 id={titleId} className="text-[1rem] font-medium text-ink">
          Discover schedules
        </h2>
        {proposals.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-muted">
            No recurring payments found that are not already a schedule or an imported
            bill.
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-auto">
            {proposals.map((proposal, index) => (
              <li key={`${proposal.accountId}:${proposal.merchant}:${index}`}>
                <label className="flex items-start gap-2 text-[0.8125rem] text-ink">
                  <input
                    type="checkbox"
                    checked={picked.has(index)}
                    onChange={() => toggle(index)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{proposal.merchant}</span>
                    {" · "}
                    {formatUsd(proposal.amountCents)}
                    {" · "}
                    {proposal.date.frequency}
                    {proposal.date.interval && proposal.date.interval > 1
                      ? ` ×${proposal.date.interval}`
                      : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="text-[0.8125rem] text-priority-a">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-[0.8125rem] text-ink-muted"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-ink px-3 py-1.5 text-[0.8125rem] text-surface disabled:opacity-50"
            disabled={saving || proposals.length === 0}
            onClick={confirm}
          >
            {saving ? "Creating…" : "Create selected"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
