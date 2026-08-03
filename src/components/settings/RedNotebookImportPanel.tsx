"use client";

import { useId, useRef, useState, useTransition } from "react";

type ImportOk = {
  ok: true;
  created: number;
  updated: number;
  skipped: number;
  rehomed: number;
  warnings: string[];
};

type ImportFail = { ok: false; error: string };

/**
 * Import RedNotebook month files (`YYYY-MM.txt` from `.rednotebook/data/`) as Day journal
 * notes under Journal → Year → Month in the Notes tree.
 */
export function RedNotebookImportPanel() {
  const headingId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportOk | null>(null);

  const runImport = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setResult(null);

    const form = new FormData();
    for (const file of Array.from(fileList)) {
      form.append("files", file);
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/rednotebook/import", {
          method: "POST",
          body: form,
        });
        const body = (await res.json()) as ImportOk | ImportFail;
        if (!body.ok) {
          setError(body.error);
          return;
        }
        setResult(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };

  return (
    <section aria-labelledby={headingId} className="mt-8 rounded border border-rule">
      <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
        <h2
          id={headingId}
          className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
        >
          RedNotebook
        </h2>
      </div>

      <div className="space-y-4 px-4 py-4 text-[0.875rem] leading-relaxed text-ink-muted">
        <p>
          Import diary days from RedNotebook month files (
          <span className="font-mono text-[0.8125rem]">YYYY-MM.txt</span> in your
          journal <span className="font-mono text-[0.8125rem]">data/</span> folder).
          Each day becomes a Journal note under{" "}
          <span className="font-medium text-ink">Journal → year → month</span>, the same
          place Day-view journals live. Re-importing the same files skips exact
          duplicates.
        </p>

        <div>
          <p className="mb-2 font-medium text-ink">Import month files</p>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            multiple
            disabled={pending}
            onChange={(e) => runImport(e.target.files)}
            className="block w-full text-[0.8125rem] text-ink file:mr-3 file:rounded file:border file:border-rule file:bg-surface-raised file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-ink"
          />
          <p className="mt-2 text-[0.8125rem] text-ink-faint">
            Select one or more month files (e.g. multi-select everything in{" "}
            <span className="font-mono">.rednotebook/data/</span>). Conflict-backup
            filenames are ignored.
          </p>
        </div>

        {pending && <p className="text-[0.8125rem] text-ink-faint">Importing…</p>}

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
              {[
                `Created ${result.created}`,
                `updated ${result.updated}`,
                `skipped ${result.skipped}`,
                result.rehomed > 0
                  ? `rehomed ${result.rehomed} existing journal notes`
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
              .
            </p>
            {result.warnings.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink-muted">
                  {result.warnings.length} warning
                  {result.warnings.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1 list-inside list-disc text-ink-faint">
                  {result.warnings.slice(0, 20).map((w, i) => (
                    <li key={`${i}-${w.slice(0, 48)}`}>{w}</li>
                  ))}
                  {result.warnings.length > 20 && (
                    <li key="more">…and {result.warnings.length - 20} more</li>
                  )}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
