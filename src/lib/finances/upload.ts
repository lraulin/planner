import { UPLOAD_BATCH_BUDGET_BYTES } from "@/lib/http/uploadLimits";
import type { FileBatchLimits } from "@/lib/import/batchFiles";

/** Matches `/api/finances/import` — a single PDF or CSV larger than this is refused there too. */
export const FINANCE_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Matches `/api/finances/import`. */
export const FINANCE_MAX_FILES = 80;

/**
 * Client packing limits for a finance import.
 *
 * The route's unused 40 MB total is not the budget. Batches must stay under the
 * Vercel 4.5 MB body ceiling or the request 413s before the route runs.
 */
export function financeUploadLimits(): FileBatchLimits {
  return {
    maxBatchBytes: UPLOAD_BATCH_BUDGET_BYTES,
    maxBatchFiles: FINANCE_MAX_FILES,
    maxFileBytes: FINANCE_MAX_FILE_BYTES,
  };
}
