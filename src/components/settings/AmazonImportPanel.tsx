"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse } from "@/lib/http/readJson";
import {
  AMAZON_UPLOAD_MAX_BYTES,
  amazonFileTooLargeForUpload,
  type AmazonImportResult,
} from "@/lib/amazon/types";

type ImportEnvelope =
  | { ok: true; data: AmazonImportResult }
  | { ok: false; error: { code: string; message: string } | string };

/** Import the slim JSON produced by `npm run amazon:slim`. */
export function AmazonImportPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const headingId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AmazonImportResult | null>(null);

  const runImport = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    if (amazonFileTooLargeForUpload(file.size)) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Re-run npm run amazon:slim — compact JSON must stay under ${(AMAZON_UPLOAD_MAX_BYTES / 1024 / 1024).toFixed(1)} MB.`,
      );
      return;
    }

    const form = new FormData();
    form.append("file", file);

    startTransition(async () => {
      try {
        const response = await fetch("/api/amazon/import", {
          method: "POST",
          body: form,
        });
        const envelope = await readJsonResponse<ImportEnvelope>(response);
        if (!envelope.ok) {
          const err = envelope.error;
          setError(typeof err === "string" ? err : err.message);
          return;
        }
        setResult(envelope.data);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Amazon import failed.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };

  return (
    <section
      aria-label={embedded ? "Amazon orders" : undefined}
      aria-labelledby={embedded ? undefined : headingId}
      className={embedded ? "" : "rounded border border-rule"}
    >
      {!embedded && (
        <div className="border-b border-rule bg-surface-raised px-4 py-2.5">
          <h2
            id={headingId}
            className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted"
          >
            Amazon orders
          </h2>
        </div>
      )}

      <div className="space-y-3 px-4 py-4 text-[0.875rem] leading-relaxed text-ink-muted">
        <p>
          Import the slim JSON from{" "}
          <code className="text-ink">
            npm run amazon:slim -- &quot;Your Orders.zip&quot;
          </code>
          . The zip itself is not accepted — it is mostly delivery photos. The script
          writes compact JSON so the file stays under the 4.5 MB upload limit.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => runImport(event.target.files)}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
            className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:opacity-50 md:min-h-0"
          >
            {pending ? "Importing…" : "Choose slim JSON…"}
          </button>
        </div>
        {error ? <p className="text-priority-a">{error}</p> : null}
        {result ? (
          <p className="text-ink">
            Items: {result.itemsCreated} created, {result.itemsUpdated} updated,{" "}
            {result.itemsUnchanged} unchanged. Orders: {result.ordersCreated} created,{" "}
            {result.ordersUpdated} updated.
          </p>
        ) : null}
      </div>
    </section>
  );
}
