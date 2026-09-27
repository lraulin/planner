"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pasteBankSnapshotAction } from "@/app/finances/actions";
import { syncAction } from "@/app/settings/bankSyncActions";
import { useToast } from "@/components/shell/ToastProvider";
import { looksLikeBankBrowserSnapshot } from "@/lib/finances/bankSnapshot";
import type { BankSnapshotApplyResult } from "@/lib/finances/bankSnapshotApply";
import { awaitingFeedPhrase } from "@/lib/finances/bankSnapshotReconcile";
import { formatUsd } from "@/lib/finances/money";
import { Panel } from "../insights/Panel";

export function RefreshBanksButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Re-read what SimpleFIN currently holds. It cannot make a bank hand over something newer."
      onClick={() => {
        startTransition(async () => {
          const result = await syncAction();
          if (result.ok) {
            const batch = result.data?.auditBatchId;
            toast.success("Re-read the bank feed.", {
              action: batch
                ? { label: "Activity", href: `/finances/activity?batch=${batch}` }
                : undefined,
            });
          } else {
            toast.error("Could not refresh accounts", { body: result.error });
          }
          router.refresh();
        });
      }}
      className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
    >
      {pending ? "Working…" : "Refresh accounts"}
    </button>
  );
}

/**
 * The Tampermonkey scripts copy the complete current-cycle card view. Applying one reconciles
 * posted transitions and selects pending using the existing per-source as-of precedence. The
 * receipt is a toast; the fallback textarea opens only when the clipboard cannot be used.
 */
export function useBankSnapshotPaste() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const apply = useCallback(
    (text: string) => {
      setFallbackReason(null);
      startTransition(async () => {
        const outcome = await pasteBankSnapshotAction(text);
        if (!outcome.ok) {
          toast.error("Bank snapshot not applied", { body: outcome.error });
          return;
        }
        const data = outcome.data;
        if (data) toastReceipt(toast, data);
        router.refresh();
      });
    },
    [router, toast],
  );

  /** Reads the clipboard; anything that is not a snapshot is shown, not applied. */
  const pasteFromClipboard = useCallback(async () => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setFallbackReason("Could not read the clipboard. Paste into the box instead.");
      return;
    }
    if (!looksLikeBankBrowserSnapshot(text)) {
      setFallbackReason(
        "The clipboard does not hold a bank snapshot. Copy one on the bank's card page, or paste text here.",
      );
      return;
    }
    apply(text);
  }, [apply]);

  const closeFallback = useCallback(() => setFallbackReason(null), []);

  return {
    pending,
    apply,
    pasteFromClipboard,
    fallbackReason,
    closeFallback,
  };
}

function toastReceipt(
  toast: ReturnType<typeof useToast>,
  data: BankSnapshotApplyResult,
) {
  const show = data.warnings.length > 0 ? toast.warning : toast.success;
  show(data.accountName, {
    body: describeBankSnapshotWrite(data),
    action: {
      label: "View Activity",
      href: `/finances/activity?event=${data.auditEventId}`,
    },
    details: (
      <>
        <p>
          Working {formatSignedDelta(data.checkpointDelta.workingBalanceCents)} · Budget
          pool {formatSignedDelta(data.checkpointDelta.accountPoolCents)} · Ready to
          Assign {formatSignedDelta(data.checkpointDelta.readyToAssignCents)}
        </p>
        {data.warnings.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-[var(--chart-spend)]">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </>
    ),
  });
}

export function BankSnapshotFallback({
  reason,
  pending,
  onApply,
  onClose,
}: {
  reason: string;
  pending: boolean;
  onApply: (text: string) => void;
  onClose: () => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Panel title="Bank snapshot" subtitle={reason}>
      <textarea
        ref={areaRef}
        spellCheck={false}
        rows={3}
        aria-label="Bank snapshot paste"
        placeholder="# planner-bank-snapshot v1"
        className="w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-[0.75rem] text-ink"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const text = areaRef.current?.value ?? "";
            if (text.trim() !== "") onApply(text);
          }}
          className="min-h-tap rounded border border-rule bg-surface-raised px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Apply text
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink md:min-h-0 md:py-1"
        >
          Close
        </button>
      </div>
    </Panel>
  );
}

function describeBankSnapshotWrite(data: BankSnapshotApplyResult): string {
  const transitions = data.posted.transitioned + data.posted.replaced;
  return (
    `${data.accountName}: ${transitions} posted transition${transitions === 1 ? "" : "s"}, ` +
    `${data.posted.inserted} new posted, ${data.pending.received} pending` +
    (data.posted.duplicates > 0 ? ` · ${data.posted.duplicates} already present` : "") +
    (data.posted.coveredByFeed > 0
      ? ` · ${data.posted.coveredByFeed} already covered by the bank feed`
      : "") +
    (data.posted.awaitingFeed.length > 0
      ? ` · ${awaitingFeedPhrase(data.posted.awaitingFeed)}`
      : "") +
    "."
  );
}

function formatSignedDelta(cents: number): string {
  if (cents === 0) return "$0.00";
  return `${cents > 0 ? "+" : "−"}${formatUsd(Math.abs(cents))}`;
}
