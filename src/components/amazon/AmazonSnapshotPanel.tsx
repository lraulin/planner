"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyAmazonSnapshotAction,
  previewAmazonSnapshotAction,
} from "@/app/finances/actions";
import { amazonSnapshotHeaderProblem } from "@/lib/amazon/snapshot";

export function AmazonSnapshotPanel() {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  function readText(): string {
    return areaRef.current?.value ?? "";
  }

  function run(mode: "preview" | "apply") {
    const text = readText();
    if (text.trim() === "") {
      setError("Paste a # planner-amazon v2 snapshot first.");
      return;
    }
    const headerProblem = amazonSnapshotHeaderProblem(text);
    if (headerProblem) {
      setError(headerProblem);
      return;
    }
    setError(null);
    setSummary(null);
    startTransition(async () => {
      if (mode === "preview") {
        const outcome = await previewAmazonSnapshotAction(text);
        if (!outcome.ok) {
          setError(outcome.error);
          return;
        }
        const counts = outcome.data?.counts;
        setSummary(
          counts
            ? `Would create ${counts.billsCreate} bills, auto-match ${counts.matchesAuto}, leave ${counts.matchesReview} to review.`
            : "Preview ready.",
        );
        return;
      }
      const outcome = await applyAmazonSnapshotAction(text);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      const data = outcome.data;
      setSummary(
        data
          ? `Created ${data.billsCreated} bills, matched ${data.matchesApplied}, linked ${data.suppliesLinked} supplies. ${data.preview.counts.matchesReview} left to review.`
          : "Imported.",
      );
      if (areaRef.current) areaRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-4 py-4 text-[0.875rem] leading-relaxed text-ink-muted">
      <p>
        On Amazon, run the Planner Tampermonkey script and copy the snapshot. It never
        sends Amazon cookies here. Paste the tagged JSON, preview, then apply. Failures
        stay in this dialog.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            void navigator.clipboard.readText().then(
              (value) => {
                if (areaRef.current) areaRef.current.value = value;
                run("apply");
              },
              () =>
                setError("Could not read the clipboard. Paste into the box instead."),
            );
          }}
          className="min-h-tap rounded border border-rule bg-surface-raised px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Paste from clipboard
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("preview")}
          className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("apply")}
          className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Apply
        </button>
      </div>
      {summary && <p className="text-[0.8125rem] text-ink">{summary}</p>}
      {error && (
        <p role="alert" className="text-[0.8125rem] text-[var(--chart-spend)]">
          {error}
        </p>
      )}
      <textarea
        ref={areaRef}
        spellCheck={false}
        rows={8}
        aria-label="Amazon subscription snapshot"
        placeholder="# planner-amazon v2"
        className="w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-[0.75rem] text-ink"
      />
    </div>
  );
}
