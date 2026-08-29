import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { importFinanceCsvFiles, type ImportFile } from "@/lib/finances/import";
import { isPdfBytes } from "@/lib/finances/pdf";
import { safeErrorMessage } from "@/lib/security/safeError";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_FILES = 80;

/**
 * POST multipart form: one or more `files` fields — bank/card CSV exports, a Coinbase
 * transaction-history CSV, Chase Prime Visa monthly statements, Capital One card monthly
 * statements, Capital One 360 monthly statement PDFs, or PayPal monthly statements.
 *
 * Route handler rather than a Server Action so a multi-file upload is not forced through
 * the React Flight serializer (same pattern as the Achieve, RedNotebook and Tomboy imports).
 *
 * Each file's format is detected on its own, so CSVs and statements can go up in one
 * request. A file that cannot be read becomes a warning rather than failing the batch.
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const form = await request.formData();
    const requestedAuditBatchId = form.get("auditBatchId");
    if (
      requestedAuditBatchId !== null &&
      (typeof requestedAuditBatchId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          requestedAuditBatchId,
        ))
    ) {
      return NextResponse.json(
        { ok: false, error: "The import receipt identity is invalid." },
        { status: 400 },
      );
    }

    const rawFiles = form.getAll("files").filter((v): v is File => v instanceof File);
    if (rawFiles.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Choose one or more transaction CSV or statement PDF files.",
        },
        { status: 400 },
      );
    }
    if (rawFiles.length > MAX_FILES) {
      return NextResponse.json(
        { ok: false, error: `Too many files (max ${MAX_FILES}).` },
        { status: 400 },
      );
    }

    let total = 0;
    const files: ImportFile[] = [];
    for (const file of rawFiles) {
      if (file.size === 0) continue;
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { ok: false, error: `"${file.name}" is larger than 5 MB.` },
          { status: 400 },
        );
      }
      total += file.size;
      if (total > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          { ok: false, error: "Total upload is larger than 40 MB." },
          { status: 400 },
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isPdfBytes(bytes) || /\.pdf$/i.test(file.name)) {
        files.push({ name: file.name, bytes });
      } else {
        files.push({
          name: file.name,
          text: new TextDecoder("utf-8").decode(bytes),
          // Keep the uploaded bytes through the request so the audit hash is exact. They
          // are not written to the database.
          bytes,
        });
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Those files were empty." },
        { status: 400 },
      );
    }

    const result = await importFinanceCsvFiles({
      userId,
      files,
      auditBatchId:
        typeof requestedAuditBatchId === "string" ? requestedAuditBatchId : undefined,
    });
    revalidatePath("/", "layout");

    const warnings =
      result.warnings.length > 50
        ? [
            ...result.warnings.slice(0, 50),
            `…and ${result.warnings.length - 50} more warnings`,
          ]
        : result.warnings;

    return NextResponse.json({
      ok: true,
      created: result.created,
      skipped: result.skipped,
      accountsCreated: result.accountsCreated,
      statementsCreated: result.statementsCreated,
      statementsSkipped: result.statementsSkipped,
      resolutionsCreated: result.resolutionsCreated,
      resolutionsSkipped: result.resolutionsSkipped,
      auditBatchId: result.auditBatchId,
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(error, "finances.import", "Import failed."),
      },
      { status: 500 },
    );
  }
}
