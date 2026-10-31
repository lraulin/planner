"use client";

import {
  mergePayeesAction,
  previewPayeeMergeAction,
} from "@/app/(shell)/finances/actions";
import { MergeDialog } from "@/components/finances/MergeDialog";
import { formatUsd } from "@/lib/finances/money";
import type { PayeeMergePreview } from "@/lib/finances/payees/queries";

function claimLabel(preview: PayeeMergePreview): string {
  if (!preview.resultingClaim) return "No envelope claim";
  return `Envelope: ${preview.resultingClaim.name}`;
}

/**
 * Choose the surviving payee and inspect every reference the merge will move.
 *
 * Takes only the identities: the Payees grid selects whole rows, while the Budget inspector's
 * Files-here list selects evidence rows for the same payees
 * (`agent-os/specs/2026-08-25-2144-payee-evidence-and-merge/` D4). Everything else the dialog
 * shows comes from the server preview, which is the only trustworthy source for it anyway.
 */
export function PayeeMergeDialog({
  payees,
  onClose,
  onMerged,
}: {
  payees: readonly { id: string; name: string }[];
  onClose: () => void;
  onMerged: (message: string) => void;
}) {
  return (
    <MergeDialog
      records={payees}
      title="Merge selected payees"
      description="Keep one identity and move the others into it. The source payee records are deleted after every reference moves."
      keepLabel="Payee to keep"
      checkingLabel="Checking references…"
      mergeLabel="Merge payees"
      loadPreview={previewPayeeMergeAction}
      runMerge={mergePayeesAction}
      refusal={(preview) => preview.refusal}
      mergedMessage={(result, preview) =>
        `${result.movedAliases} spellings and ${result.movedTransactions} charges merged into ${preview.target.name}.`
      }
      details={(preview) => (
        <>
          <dl className="grid grid-cols-2 gap-3 text-[0.8125rem] sm:grid-cols-4">
            <div>
              <dt className="text-ink-muted">Spellings</dt>
              <dd className="mt-0.5 tabular-nums text-ink">
                {preview.movedAliases.length}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Charges</dt>
              <dd className="mt-0.5 tabular-nums text-ink">
                {preview.movedTransactions.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Register total</dt>
              <dd className="mt-0.5 tabular-nums text-ink">
                {formatUsd(preview.movedTotalCents)}
              </dd>
            </div>
          </dl>

          {preview.movedAliases.length > 0 && (
            <p className="text-[0.75rem] leading-relaxed text-ink-muted">
              Spellings: {preview.movedAliases.join(", ")}
            </p>
          )}
          <p className="text-[0.75rem] leading-relaxed text-ink-muted">
            Result: {claimLabel(preview)}
          </p>
        </>
      )}
      onClose={onClose}
      onMerged={onMerged}
    />
  );
}
