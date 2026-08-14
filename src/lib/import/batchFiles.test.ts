import { describe, expect, it } from "vitest";
import { UPLOAD_BATCH_BUDGET_BYTES } from "@/lib/http/uploadLimits";
import { financeUploadLimits } from "@/lib/finances/upload";
import { effectiveFileLimit, packFileBatches } from "./batchFiles";

function file(name: string, size: number) {
  return { name, size };
}

describe("packFileBatches", () => {
  const tight = {
    maxBatchBytes: 100,
    maxBatchFiles: 3,
    maxFileBytes: 80,
  };

  it("returns nothing for an empty selection", () => {
    expect(packFileBatches([], tight)).toEqual({ batches: [], rejected: [] });
  });

  it("drops empty files the way the route does", () => {
    expect(packFileBatches([file("blank.csv", 0), file("ok.csv", 10)], tight)).toEqual({
      batches: [[file("ok.csv", 10)]],
      rejected: [],
    });
  });

  it("keeps one file that fits in a single batch", () => {
    const only = file("one.pdf", 80);
    expect(packFileBatches([only], tight).batches).toEqual([[only]]);
  });

  it("rejects a file larger than the effective per-file limit", () => {
    const huge = file("huge.pdf", 90);
    const plan = packFileBatches([huge, file("ok.pdf", 10)], tight);
    expect(plan.rejected).toEqual([{ file: huge, limit: 80 }]);
    expect(plan.batches).toEqual([[file("ok.pdf", 10)]]);
  });

  it("caps the per-file limit at the batch budget, not the unused route total", () => {
    expect(effectiveFileLimit(financeUploadLimits())).toBe(UPLOAD_BATCH_BUDGET_BYTES);
    expect(effectiveFileLimit(financeUploadLimits())).toBeLessThan(5 * 1024 * 1024);
  });

  it("splits many small files across batches", () => {
    const files = [file("a", 40), file("b", 40), file("c", 40), file("d", 10)];
    expect(packFileBatches(files, tight).batches).toEqual([
      [files[0], files[1]],
      [files[2], files[3]],
    ]);
  });

  it("honours the file-count cap even when bytes still fit", () => {
    const files = [file("a", 1), file("b", 1), file("c", 1), file("d", 1)];
    expect(packFileBatches(files, tight).batches).toEqual([
      [files[0], files[1], files[2]],
      [files[3]],
    ]);
  });

  it("puts a leftover last file in its own batch", () => {
    const files = [file("a", 60), file("b", 60)];
    expect(packFileBatches(files, tight).batches).toEqual([[files[0]], [files[1]]]);
  });

  it("would be one batch against the route's unused 40 MB and is not", () => {
    // Ten 1 MB statements. A packer that trusted the route's 40 MB total would
    // send them in one POST; Vercel would 413. Four megabytes is three trips.
    const files = Array.from({ length: 10 }, (_, index) =>
      file(`${index}.pdf`, 1024 * 1024),
    );
    const plan = packFileBatches(files, financeUploadLimits());
    expect(plan.rejected).toEqual([]);
    expect(plan.batches.map((batch) => batch.length)).toEqual([4, 4, 2]);
  });
});
