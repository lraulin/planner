"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { financeUploadLimits } from "@/lib/finances/upload";
import { readJsonResponse } from "@/lib/http/readJson";
import { packFileBatches } from "@/lib/import/batchFiles";

type ImportOk = {
  ok: true;
  created: number;
  skipped: number;
  accountsCreated: number;
  statementsCreated: number;
  statementsSkipped: number;
  resolutionsCreated: number;
  resolutionsSkipped: number;
  warnings: string[];
};

type ImportFail = { ok: false; error: string };

/**
 * Import bank/card CSV exports, Chase Prime Visa monthly statements, Capital One
 * card monthly statements, Capital One 360 monthly statement PDFs, and PayPal
 * monthly statements. Format is detected per file. PayPal files enrich existing
 * rows; they do not insert a PayPal account.
 *
 * Re-importing an overlapping file is the normal case — you download the last N days each
 * time, and statements overlap the bank CSV — so the result line leads with created and
 * skipped rather than treating skips as a problem.
 */
function emptyImportOk(): ImportOk {
  return {
    ok: true,
    created: 0,
    skipped: 0,
    accountsCreated: 0,
    statementsCreated: 0,
    statementsSkipped: 0,
    resolutionsCreated: 0,
    resolutionsSkipped: 0,
    warnings: [],
  };
}

function addImportOk(left: ImportOk, right: ImportOk): ImportOk {
  return {
    ok: true,
    created: left.created + right.created,
    skipped: left.skipped + right.skipped,
    accountsCreated: left.accountsCreated + right.accountsCreated,
    statementsCreated: left.statementsCreated + right.statementsCreated,
    statementsSkipped: left.statementsSkipped + right.statementsSkipped,
    resolutionsCreated:
      (left.resolutionsCreated ?? 0) + (right.resolutionsCreated ?? 0),
    resolutionsSkipped:
      (left.resolutionsSkipped ?? 0) + (right.resolutionsSkipped ?? 0),
    warnings: [...left.warnings, ...right.warnings],
  };
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export function FinanceImportPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const headingId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportOk | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const runImport = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setResult(null);
    setProgress(null);

    const plan = packFileBatches(Array.from(fileList), financeUploadLimits());
    const totalQueued = plan.batches.reduce((count, batch) => count + batch.length, 0);

    startTransition(async () => {
      try {
        let combined = emptyImportOk();
        if (plan.rejected.length > 0) {
          combined = {
            ...combined,
            warnings: plan.rejected.map(
              (entry) =>
                `"${entry.file.name}" is larger than ${formatMb(entry.limit)} and cannot be split.`,
            ),
          };
        }

        let sent = 0;
        for (const batch of plan.batches) {
          const from = sent + 1;
          const to = sent + batch.length;
          setProgress(
            plan.batches.length > 1
              ? `Importing files ${from}–${to} of ${totalQueued}…`
              : "Importing…",
          );
          const form = new FormData();
          for (const file of batch) form.append("files", file);
          const res = await fetch("/api/finances/import", {
            method: "POST",
            body: form,
          });
          const body = await readJsonResponse<ImportOk | ImportFail>(res);
          if (!body.ok) {
            setError(body.error);
            if (combined.created + combined.skipped + combined.warnings.length > 0) {
              setResult(combined);
            }
            return;
          }
          combined = addImportOk(combined, body);
          sent = to;
        }

        if (plan.batches.length === 0 && plan.rejected.length === 0) {
          setError("Those files were empty.");
          return;
        }

        setResult(combined);
        // The register is a server component; without this the new rows are in the
        // database and not on the screen.
        if (plan.batches.length > 0) router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      } finally {
        setProgress(null);
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
          Import transaction CSVs or monthly statement PDFs. Chase credit card, Capital
          One card, and Capital One 360 Checking and Savings CSVs, plus Chase Prime
          Visa, Capital One card, and Capital One 360 monthly statements, are recognised
          automatically, so you can select all of them at once. Accounts are created the
          first time they are seen and matched by account number after that — rename
          them freely.
        </p>
        <p>
          Re-importing a file that overlaps one you already loaded is expected and safe:
          transactions you already have are skipped, and any category or note you have
          written is never overwritten. A Chase or Capital One card statement that
          overlaps that card&rsquo;s CSV lands on the same account and is skipped the
          same way. Each statement also stores a snapshot (closing balance, due date,
          credit line) for later reconciliation.
        </p>

        <div>
          <p className="mb-2 font-medium text-ink">Choose CSV or PDF files</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.pdf,text/csv,application/pdf"
            multiple
            disabled={pending}
            onChange={(e) => runImport(e.target.files)}
            className="block w-full text-[0.8125rem] text-ink file:mr-3 file:rounded file:border file:border-rule file:bg-surface-raised file:px-3 file:py-1.5 file:text-[0.8125rem] file:font-medium file:text-ink"
          />
          <p className="mt-2 text-[0.8125rem] text-ink-faint">
            Keep the bank&rsquo;s original filenames on Chase and Capital One card
            files. Chase does not put a stable account number inside the CSV, and both
            issuers reprint a changing last four on the PDF — the <code>9910</code> or
            <code>3448</code> in the filename is the identity.
          </p>
        </div>

        {pending && (
          <p className="text-[0.8125rem] text-ink-faint">{progress ?? "Importing…"}</p>
        )}

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
              {(result.statementsCreated > 0 || result.statementsSkipped > 0) &&
                ` ${result.statementsCreated} statement snapshot${result.statementsCreated === 1 ? "" : "s"}, ${result.statementsSkipped} already stored.`}
              {(result.resolutionsCreated > 0 || result.resolutionsSkipped > 0) &&
                ` ${result.resolutionsCreated} PayPal name${result.resolutionsCreated === 1 ? "" : "s"}, ${result.resolutionsSkipped} already stored.`}
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
