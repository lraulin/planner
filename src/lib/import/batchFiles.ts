/**
 * Split a multi-file picker selection into POSTs that fit a request-body budget.
 *
 * The finance route advertises 40 MB; Vercel Functions 413 around 4.5 MB. The
 * packer is what makes "select the whole folder" work instead of forcing the
 * user to re-pick a handful at a time.
 */

export type SizedFile = { name: string; size: number };

export type FileBatchLimits = {
  /** Soft cap on the sum of `size` in one batch. */
  maxBatchBytes: number;
  /** Soft cap on how many files one batch may hold. */
  maxBatchFiles: number;
  /** Per-file cap from the route. Effective limit is min of this and `maxBatchBytes`. */
  maxFileBytes: number;
};

export type RejectedFile<T extends SizedFile> = {
  file: T;
  /** The effective per-file limit that rejected it. */
  limit: number;
};

export type FileBatchPlan<T extends SizedFile> = {
  batches: T[][];
  rejected: RejectedFile<T>[];
};

export function effectiveFileLimit(limits: FileBatchLimits): number {
  return Math.min(limits.maxFileBytes, limits.maxBatchBytes);
}

/**
 * Pack files in selection order. Empty files are dropped (the route ignores them).
 * A file larger than the effective per-file limit cannot be split and is rejected.
 */
export function packFileBatches<T extends SizedFile>(
  files: readonly T[],
  limits: FileBatchLimits,
): FileBatchPlan<T> {
  const fileLimit = effectiveFileLimit(limits);
  const batches: T[][] = [];
  const rejected: RejectedFile<T>[] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const file of files) {
    if (file.size === 0) continue;
    if (file.size > fileLimit) {
      rejected.push({ file, limit: fileLimit });
      continue;
    }
    const wouldOverflow =
      current.length >= limits.maxBatchFiles ||
      currentBytes + file.size > limits.maxBatchBytes;
    if (wouldOverflow && current.length > 0) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }
  if (current.length > 0) batches.push(current);

  return { batches, rejected };
}
