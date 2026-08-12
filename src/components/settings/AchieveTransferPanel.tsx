"use client";

import { useId, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { readJsonResponse } from "@/lib/http/readJson";

type ImportOk = {
  ok: true;
  created: number;
  counts: {
    result_area?: number;
    project?: number;
    task?: number;
    goal?: number;
    omitted?: number;
  };
  extras?: {
    appointments?: number;
    timeCharts?: number;
    timeChartAreas?: number;
    wishes?: number;
    notes?: number;
  };
  warnings: string[];
  skippedTables: string[];
  message?: string;
};

type ImportFail = { ok: false; error: string };

/**
 * Import / export Achieve Full XML (achxml) for the outline core.
 *
 * Large files go through `/api/achieve/*` route handlers (multipart / raw response), not
 * Server Actions — Flight serialization rejects multi-MB XML with nesting/body errors.
 */
export function AchieveTransferPanel({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const headingId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  /** Hold the File until the user confirms replace — avoid parking multi-MB XML in React state. */
  const pendingFileRef = useRef<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportOk | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("replace");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const onExport = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/achieve/export");
        if (!res.ok) {
          let message = "Export failed.";
          try {
            const body = (await res.json()) as ImportFail;
            if (body.error) message = body.error;
          } catch {
            /* use default */
          }
          setError(message);
          return;
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = /filename="([^"]+)"/.exec(disposition);
        const filename =
          match?.[1] ??
          `planner-export-${new Date().toISOString().slice(0, 10)}.achxml`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        const counts = {
          result_area: 0,
          goal: 0,
          project: 0,
          task: 0,
          omitted: 0,
        };
        try {
          Object.assign(
            counts,
            JSON.parse(res.headers.get("X-Achieve-Export-Counts") ?? "{}") as Partial<
              typeof counts
            >,
          );
        } catch {
          /* ignore */
        }
        const warningCount = Number(
          res.headers.get("X-Achieve-Export-Warnings") ?? "0",
        );
        setResult({
          ok: true,
          created: 0,
          counts,
          warnings: warningCount > 0 ? [`${warningCount} export warning(s)`] : [],
          skippedTables: [],
          message:
            `Exported ${counts.result_area} result areas, ${counts.goal} goals, ${counts.project} projects, ${counts.task} tasks` +
            (counts.omitted ? ` (omitted ${counts.omitted} other)` : ""),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed.");
      }
    });
  };

  const runImport = (file: File, importMode: "merge" | "replace") => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("mode", importMode);
        const res = await fetch("/api/achieve/import", {
          method: "POST",
          body: form,
        });
        const body = await readJsonResponse<ImportOk | ImportFail>(res);
        if (!body.ok) {
          setError(body.error);
          return;
        }
        setResult(body);
        if (fileRef.current) fileRef.current.value = "";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      }
    });
  };

  const onPickFile = (file: File | null) => {
    if (!file) return;
    setError(null);
    if (mode === "replace") {
      pendingFileRef.current = file;
      setConfirmReplace(true);
    } else {
      runImport(file, "merge");
    }
  };

  return (
    <section
      aria-label={embedded ? "Achieve Planner XML" : undefined}
      aria-labelledby={embedded ? undefined : headingId}
      className={embedded ? "" : "mt-8 rounded border border-rule"}
    >
      {!embedded && (
        <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
          <h2
            id={headingId}
            className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
          >
            Achieve Planner (XML)
          </h2>
        </div>
      )}

      <div className="space-y-4 px-4 py-4 text-[0.875rem] leading-relaxed text-ink-muted">
        <p>
          Import a Full XML export from Achieve Planner (File → Full XML export /{" "}
          <span className="font-mono text-[0.8125rem]">.achxml</span>
          ), or export this account&apos;s outline as XML Achieve can Load from XML.
          Transfers result areas, goals/dreams, projects, tasks, appointments, time
          charts, wishes, and notes. Other tables are listed as skipped after import.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            onClick={onExport}
            disabled={pending}
            className="rounded border border-rule bg-surface-raised px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-rule-strong disabled:opacity-50"
          >
            {pending ? "Working…" : "Export outline XML"}
          </button>
        </div>

        <div className="border-t border-rule pt-4">
          <p className="mb-2 font-medium text-ink">Import</p>
          <div className="mb-3 flex flex-wrap gap-4 text-[0.8125rem]">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="achieve-import-mode"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
              />
              Replace outline
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="achieve-import-mode"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
              />
              Merge (append)
            </label>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".achxml,.xml,application/xml,text/xml"
            disabled={pending}
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[0.8125rem] text-ink file:mr-3 file:rounded file:border file:border-rule file:bg-surface-raised file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-ink"
          />
          {mode === "replace" && (
            <p className="mt-2 text-[0.8125rem] text-ink-faint">
              Replace deletes this account&apos;s outline, appointments, time charts,
              and notes before importing.
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a"
          >
            {error}
          </p>
        )}

        {result?.ok && (
          <div className="rounded border border-rule bg-surface-raised px-3 py-2 text-[0.8125rem] text-ink">
            <p className="font-medium">
              {result.message ??
                [
                  `Imported ${result.created} outline rows (${result.counts.result_area ?? 0} areas, ${result.counts.goal ?? 0} goals, ${result.counts.project ?? 0} projects, ${result.counts.task ?? 0} tasks)`,
                  result.extras &&
                  (result.extras.appointments ||
                    result.extras.timeCharts ||
                    result.extras.wishes ||
                    result.extras.notes)
                    ? ` + ${result.extras.appointments ?? 0} appts, ${result.extras.timeCharts ?? 0} time charts (${result.extras.timeChartAreas ?? 0} areas), ${result.extras.wishes ?? 0} wishes, ${result.extras.notes ?? 0} notes`
                    : "",
                  ".",
                ].join("")}
            </p>
            {result.warnings.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink-muted">
                  {result.warnings.length} warning
                  {result.warnings.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1 list-inside list-disc text-ink-faint">
                  {result.warnings.slice(0, 20).map((w, i) => (
                    // Warnings often repeat the same text (same rule on many rows).
                    <li key={`${i}-${w.slice(0, 48)}`}>{w}</li>
                  ))}
                  {result.warnings.length > 20 && (
                    <li key="more">…and {result.warnings.length - 20} more</li>
                  )}
                </ul>
              </details>
            )}
            {result.skippedTables.length > 0 && result.created > 0 && (
              <p className="mt-1 text-ink-faint">
                Skipped tables in file: {result.skippedTables.slice(0, 8).join(", ")}
                {result.skippedTables.length > 8 ? "…" : ""}
              </p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title="Replace outline with Achieve file?"
        message="Every result area, project, task, and goal on this account will be deleted, then the XML will be imported. This cannot be undone."
        confirmLabel="Replace and import"
        destructive
        onCancel={() => {
          setConfirmReplace(false);
          pendingFileRef.current = null;
          if (fileRef.current) fileRef.current.value = "";
        }}
        onConfirm={() => {
          const file = pendingFileRef.current;
          setConfirmReplace(false);
          pendingFileRef.current = null;
          if (file) runImport(file, "replace");
        }}
      />
    </section>
  );
}
