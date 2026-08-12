"use client";

import { useId, useRef, useState, useTransition } from "react";
import { readJsonResponse } from "@/lib/http/readJson";

type ImportData = {
  created: number;
  updated: number;
  skipped: number;
  templatesSkipped: number;
  ignoredFiles: number;
  invalidFiles: number;
  warnings: string[];
};

type ImportEnvelope =
  | { ok: true; data: ImportData }
  | { ok: false; error: { code: string; message: string } };

const directoryAttributes = {
  // React passes lowercase custom attributes through to the native file input. Chromium
  // and Safari use these to return every file below the selected sync repository.
  webkitdirectory: "",
  directory: "",
};

/** Import Tomboy `.note` XML as flat notes with subject `Tomboy`. */
export function TomboyImportPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const headingId = useId();
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportData | null>(null);

  const runImport = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setResult(null);

    // A sync folder may also contain the old HTML export. Do not upload hundreds of
    // unrelated files merely so the server can ignore them.
    const selectedNotes = Array.from(fileList).filter((file) =>
      file.name.toLowerCase().endsWith(".note"),
    );
    if (selectedNotes.length === 0) {
      setError("No Tomboy .note files were found in that selection.");
      return;
    }

    const form = new FormData();
    for (const file of selectedNotes) {
      form.append("files", file, file.webkitRelativePath || file.name);
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/tomboy/import", {
          method: "POST",
          body: form,
        });
        const envelope = await readJsonResponse<ImportEnvelope>(response);
        if (!envelope.ok) {
          setError(envelope.error.message);
          return;
        }
        setResult(envelope.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Tomboy import failed.");
      } finally {
        if (filesRef.current) filesRef.current.value = "";
        if (folderRef.current) folderRef.current.value = "";
      }
    });
  };

  return (
    <section
      aria-label={embedded ? "Tomboy" : undefined}
      aria-labelledby={embedded ? undefined : headingId}
      className={embedded ? "" : "mt-8 rounded border border-rule"}
    >
      {!embedded && (
        <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
          <h2
            id={headingId}
            className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
          >
            Tomboy
          </h2>
        </div>
      )}

      <div className="space-y-4 px-4 py-4 text-[0.875rem] leading-relaxed text-ink-muted">
        <p>
          Import Tomboy notes from a file-sync repository. Each ordinary note becomes a
          flat note with subject <span className="font-medium text-ink">Tomboy</span>;
          Tomboy notebooks become contexts, the creation day appears in Date, and the
          original creation/change times are kept. Re-importing updates by Tomboy UUID
          without overwriting newer Planner edits.
        </p>

        <div>
          <p className="mb-2 font-medium text-ink">Import a sync folder</p>
          <input
            {...directoryAttributes}
            ref={folderRef}
            type="file"
            aria-label="Tomboy sync folder"
            multiple
            disabled={pending}
            onChange={(event) => runImport(event.target.files)}
            className="block w-full text-[0.8125rem] text-ink file:mr-3 file:rounded file:border file:border-rule file:bg-surface-raised file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-ink"
          />
          <p className="mt-2 text-[0.8125rem] text-ink-faint">
            Choose the top-level <span className="font-mono">tomboy</span> folder.
            Nested files such as <span className="font-mono">0/0/*.note</span> are found
            automatically; manifests and templates are skipped.
          </p>
        </div>

        <div>
          <p className="mb-2 font-medium text-ink">Or import note files</p>
          <input
            ref={filesRef}
            type="file"
            aria-label="Tomboy note files"
            accept=".note,application/xml,text/xml"
            multiple
            disabled={pending}
            onChange={(event) => runImport(event.target.files)}
            className="block w-full text-[0.8125rem] text-ink file:mr-3 file:rounded file:border file:border-rule file:bg-surface-raised file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-ink"
          />
          <p className="mt-2 text-[0.8125rem] text-ink-faint">
            Multi-select the UUID-named <span className="font-mono">.note</span> files
            if your browser does not offer folder selection.
          </p>
        </div>

        {pending ? <p className="text-[0.8125rem] text-ink-faint">Importing…</p> : null}

        {error ? (
          <p
            role="alert"
            className="rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a"
          >
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="rounded border border-rule bg-surface-raised px-3 py-2 text-[0.8125rem] text-ink">
            <p className="font-medium">
              {`Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}.`}
            </p>
            <p className="mt-1 text-ink-muted">
              {`Skipped ${result.templatesSkipped} template${result.templatesSkipped === 1 ? "" : "s"}`}
              {result.invalidFiles > 0
                ? `; ${result.invalidFiles} invalid file(s)`
                : ""}
              .
            </p>
            {result.warnings.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-ink-muted">
                  {result.warnings.length} warning
                  {result.warnings.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1 list-inside list-disc text-ink-faint">
                  {result.warnings.slice(0, 20).map((warning, index) => (
                    <li key={`${index}-${warning.slice(0, 48)}`}>{warning}</li>
                  ))}
                  {result.warnings.length > 20 ? (
                    <li>…and {result.warnings.length - 20} more</li>
                  ) : null}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
