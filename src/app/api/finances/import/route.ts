import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { importFinanceCsvFiles } from "@/lib/finances/import";
import { safeErrorMessage } from "@/lib/security/safeError";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 40;

/**
 * POST multipart form: one or more `files` fields, each a bank or card CSV export.
 *
 * Route handler rather than a Server Action so a multi-file upload is not forced through
 * the React Flight serializer (same pattern as the Achieve, RedNotebook and Tomboy imports).
 *
 * Each file's format is detected from its own header, so all four exports can go up in one
 * request. A file that cannot be read becomes a warning rather than failing the batch — the
 * point of a bulk import is that one bad file does not cost you the other three.
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const form = await request.formData();

    const rawFiles = form.getAll("files").filter((v): v is File => v instanceof File);
    if (rawFiles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Choose one or more transaction CSV files." },
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
    const files: { name: string; text: string }[] = [];
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
          { ok: false, error: "Total upload is larger than 25 MB." },
          { status: 400 },
        );
      }
      files.push({ name: file.name, text: await file.text() });
    }

    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Those files were empty." },
        { status: 400 },
      );
    }

    const result = await importFinanceCsvFiles({ userId, files });
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
