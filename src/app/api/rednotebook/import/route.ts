import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { importRedNotebookFiles } from "@/lib/rednotebook/import";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 120;

/**
 * POST multipart form: one or more `files` fields (`YYYY-MM.txt` month files).
 *
 * Route handler rather than a Server Action so multi-file diaries are not forced through
 * the React Flight serializer (same pattern as Achieve import).
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const form = await request.formData();

    const rawFiles = form.getAll("files").filter((v): v is File => v instanceof File);
    if (rawFiles.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Choose one or more RedNotebook month files (YYYY-MM.txt).",
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
    const files: { name: string; text: string }[] = [];
    for (const file of rawFiles) {
      if (file.size === 0) continue;
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { ok: false, error: `"${file.name}" is larger than 2 MB.` },
          { status: 400 },
        );
      }
      total += file.size;
      if (total > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          { ok: false, error: "Total upload is larger than 15 MB." },
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

    const result = await importRedNotebookFiles({ userId, files });
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
      updated: result.updated,
      skipped: result.skipped,
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Import failed.",
      },
      { status: 500 },
    );
  }
}
