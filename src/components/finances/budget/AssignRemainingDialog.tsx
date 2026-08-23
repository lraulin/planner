"use client";

import { useId, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { formatUsd } from "@/lib/finances/money";

export function AssignRemainingDialog({
  amountCents,
  envelopes,
  onCancel,
  onAssign,
}: {
  amountCents: number;
  envelopes: readonly { id: string; name: string }[];
  onCancel: () => void;
  onAssign: (id: string) => void;
}) {
  const titleId = useId();
  const [target, setTarget] = useState(envelopes[0]?.id ?? "");
  return (
    <ModalShell open onClose={onCancel} labelledBy={titleId} width="max-w-md">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Assign remaining
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          Give all {formatUsd(amountCents)} still Ready to Assign one job.
        </p>
        <label className="mt-4 flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Envelope
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base font-normal normal-case tracking-normal text-ink md:min-h-0 md:text-[0.8125rem]"
          >
            {envelopes.map((envelope) => (
              <option key={envelope.id} value={envelope.id}>
                {envelope.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink md:min-h-0"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={target === ""}
            onClick={() => onAssign(target)}
            className="min-h-tap rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0"
          >
            Assign {formatUsd(amountCents)}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
