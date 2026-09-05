"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pasteBankSnapshotAction } from "@/app/finances/actions";
import { syncAction } from "@/app/settings/bankSyncActions";
import type { BankSnapshotApplyResult } from "@/lib/finances/bankSnapshotApply";
import { formatUsd } from "@/lib/finances/money";
import { Panel } from "../insights/Panel";
export function RefreshBanksButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [auditBatchId, setAuditBatchId] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        title="Re-read what SimpleFIN currently holds. It cannot make a bank hand over something newer."
        onClick={() => {
          setNotice(null);
          setAuditBatchId(null);
          startTransition(async () => {
            const result = await syncAction();
            setNotice(result.ok ? "Re-read the bank feed." : result.error);
            if (result.ok) setAuditBatchId(result.data?.auditBatchId ?? null);
            router.refresh();
          });
        }}
        className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
      >
        {pending ? "Working…" : "Refresh accounts"}
      </button>
      {notice && (
        <span className="text-[0.75rem] text-ink-muted">
          {notice}
          {auditBatchId && (
            <>
              {" · "}
              <Link
                href={`/finances/activity?batch=${auditBatchId}`}
                className="underline decoration-rule underline-offset-2 hover:text-ink"
              >
                Activity
              </Link>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * The Tampermonkey scripts copy the complete current-cycle card view. This paste reconciles
 * posted transitions and selects pending using the existing per-source as-of precedence.
 */
export function BankSnapshotPaste({
  staleAccountNames,
}: {
  staleAccountNames: string[];
}) {
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const [receipt, setReceipt] = useState<BankSnapshotApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(value: string) {
    const payload = value.trim() === "" ? (areaRef.current?.value ?? "") : value;
    if (payload.trim() === "") return;
    setError(null);
    setReceipt(null);
    startTransition(async () => {
      const outcome = await pasteBankSnapshotAction(payload);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      const data = outcome.data;
      if (data) setReceipt(data);
      if (areaRef.current) areaRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <Panel
      title="Bank snapshot"
      subtitle="Copy a complete current-cycle snapshot on the Chase or Capital One card page, then paste it here. Planner reconciles posted and pending together."
    >
      {staleAccountNames.length > 0 && (
        <p role="status" className="mb-2 text-[0.8125rem] text-[var(--chart-spend)]">
          Capture a fresh snapshot for {staleAccountNames.join(", ")}. Its browser
          pending is stale, so SimpleFIN pending is active until you refresh it.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            void navigator.clipboard.readText().then(
              (value) => {
                if (areaRef.current) areaRef.current.value = value;
                apply(value);
              },
              () => {
                setError("Could not read the clipboard. Paste into the box instead.");
              },
            );
          }}
          className="min-h-tap rounded border border-rule bg-surface-raised px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Paste from clipboard
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => apply(areaRef.current?.value ?? "")}
          className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Apply text
        </button>
      </div>
      {receipt && (
        <div className="mt-2 text-[0.8125rem] text-ink">
          <p>{describeBankSnapshotWrite(receipt)}</p>
          <p className="mt-1 text-ink-muted">
            Working {formatSignedDelta(receipt.checkpointDelta.workingBalanceCents)} ·
            Budget pool {formatSignedDelta(receipt.checkpointDelta.accountPoolCents)} ·
            Ready to Assign{" "}
            {formatSignedDelta(receipt.checkpointDelta.readyToAssignCents)}
            {" · "}
            <Link
              href={`/finances/activity?event=${receipt.auditEventId}`}
              className="text-ink-muted underline decoration-rule underline-offset-2 hover:text-ink"
            >
              View Activity
            </Link>
          </p>
          {receipt.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[var(--chart-spend)]">
              {receipt.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[0.8125rem] text-[var(--chart-spend)]">
          {error}
        </p>
      )}
      <textarea
        ref={areaRef}
        spellCheck={false}
        rows={3}
        aria-label="Bank snapshot paste"
        placeholder="# planner-bank-snapshot v1"
        className="mt-2 w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-[0.75rem] text-ink"
      />
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
    "."
  );
}

function formatSignedDelta(cents: number): string {
  if (cents === 0) return "$0.00";
  return `${cents > 0 ? "+" : "−"}${formatUsd(Math.abs(cents))}`;
}
