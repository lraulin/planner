"use client";

import { useId, useRef, useState, useTransition } from "react";
import {
  exportAchieveXmlAction,
  importAchieveXmlAction,
  type ImportAchieveResult,
} from "@/app/settings/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";

/**
 * Import / export Achieve Full XML (achxml) for the outline core.
 *
 * Export downloads a file. Import reads a local file and offers merge (append) or replace
 * (wipe this account's outline first). Replace is the usual "bring my AP file over" path.
 */
export function AchieveTransferPanel() {
  const headingId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportAchieveResult | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("replace");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pendingXml, setPendingXml] = useState<string | null>(null);

  const onExport = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await exportAchieveXmlAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `planner-export-${new Date().toISOString().slice(0, 10)}.achxml`;
      a.click();
      URL.revokeObjectURL(url);
      setResult({
        ok: true,
        created: 0,
        counts: res.counts,
        warnings: res.warnings,
        skippedTables: [],
        message:
          `Exported ${res.counts.result_area} result areas, ${res.counts.project} projects, ${res.counts.task} tasks` +
          (res.counts.omitted ? ` (omitted ${res.counts.omitted} goals/other)` : ""),
      });
    });
  };

  const readFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsText(file);
    });

  const runImport = (xml: string, importMode: "merge" | "replace") => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await importAchieveXmlAction(xml, importMode);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const xml = await readFile(file);
      if (mode === "replace") {
        setPendingXml(xml);
        setConfirmReplace(true);
      } else {
        runImport(xml, "merge");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  };

  return (
    <section aria-labelledby={headingId} className="mt-8 rounded border border-rule">
      <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
        <h2
          id={headingId}
          className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
        >
          Achieve Planner (XML)
        </h2>
      </div>

      <div className="space-y-4 px-4 py-4 text-[0.875rem] leading-relaxed text-ink-muted">
        <p>
          Import a Full XML export from Achieve Planner (File → Full XML export /{" "}
          <span className="font-mono text-[0.8125rem]">.achxml</span>
          ), or export this account&apos;s outline as XML Achieve can Load from XML.
          Only result areas, projects, and tasks are transferred; goals and appointments
          are skipped for now.
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
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[0.8125rem] text-ink file:mr-3 file:rounded file:border file:border-rule file:bg-surface-raised file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-ink"
          />
          {mode === "replace" && (
            <p className="mt-2 text-[0.8125rem] text-ink-faint">
              Replace deletes every outline row for this account before importing.
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
                `Imported ${result.created} rows (${result.counts.result_area} areas, ${result.counts.project} projects, ${result.counts.task} tasks).`}
            </p>
            {result.warnings.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink-muted">
                  {result.warnings.length} warning
                  {result.warnings.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1 list-inside list-disc text-ink-faint">
                  {result.warnings.slice(0, 20).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  {result.warnings.length > 20 && (
                    <li>…and {result.warnings.length - 20} more</li>
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
          setPendingXml(null);
          if (fileRef.current) fileRef.current.value = "";
        }}
        onConfirm={() => {
          const xml = pendingXml;
          setConfirmReplace(false);
          setPendingXml(null);
          if (xml) runImport(xml, "replace");
        }}
      />
    </section>
  );
}
