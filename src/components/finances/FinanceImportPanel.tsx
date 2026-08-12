"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ImportOk = {
  ok: true;
  created: number;
  skipped: number;
  accountsCreated: number;
  warnings: string[];
};

type ImportFail = { ok: false; error: string };

/**
 * Import bank and card CSV exports. Format is detected per file, so every export can go up
 * in one selection.
 *
 * Re-importing an overlapping file is the normal case — you download the last N days each
 * time — so the result line leads with created and skipped rather than treating skips as a
 * problem.
 */
export function FinanceImportPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const headingId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
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
        const res = await fetch("/api/finances/import", {
          method: "POST",
          body: form,
        });
        const body = (await res.json()) as ImportOk | ImportFail;
        if (!body.ok) {
          setError(body.error);
          return;
        }
        setResult(body);
        // The register is a server component; without this the new rows are in the
        // database and not on the screen.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };

  return (
    <section
      aria-label={embedded ? "Transactions" : undefined}
      aria-labelledby={embedded ? undefined : headingId}
      className={embedded ? "" : "rounded border border-rule"}
    >
      {!embedded && (
        <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
          <h2
            id={headingId}
            className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
          >
            Import transactions
          </h2>
        </div>
      )}

      <div className="space-y-4 px-4 py-4 text-[0.875rem] leading-relaxed text-ink-muted">
        <p>
          Import transaction CSVs downloaded from your bank. Chase credit card, Capital
          One card, and Capital One 360 Checking and Savings are recognised
          automatically, so you can select all of them at once. Accounts are created the
          first time they are seen and matched by account number after that — rename
          them freely.
        </p>
        <p>
          Re-importing a file that overlaps one you already loaded is expected and safe:
          transactions you already have are skipped, and any category or note you have
          written is never overwritten.
        </p>

        <div>
          <p className="mb-2 font-medium text-ink">Choose CSV files</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            disabled={pending}
            onChange={(e) => runImport(e.target.files)}
            className="block w-full text-[0.8125rem] text-ink file:mr-3 file:rounded file:border file:border-rule file:bg-surface-raised file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-ink"
          />
          <p className="mt-2 text-[0.8125rem] text-ink-faint">
            Keep the bank&rsquo;s original filenames. Chase does not put the account
            number inside the file — it is only in the name.
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
              {`Imported ${result.created}, skipped ${result.skipped} already stored.`}
              {result.accountsCreated > 0 &&
                ` ${result.accountsCreated} new account${result.accountsCreated === 1 ? "" : "s"}.`}
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
