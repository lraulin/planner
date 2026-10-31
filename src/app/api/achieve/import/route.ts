import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { findCurrentAccount } from "@/lib/auth";
import { importAchieveXml } from "@/lib/achieve/import";
import { parseImportMode } from "@/lib/achieve/importMode";
import { capWarnings } from "@/lib/http/capWarnings";
import { safeErrorMessage } from "@/lib/security/safeError";

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * POST multipart form: `file` (XML), `mode` (`replace` | `merge`).
 *
 * Uses a route handler rather than a Server Action so multi-MB Achieve dumps are not
 * forced through the React Flight serializer (which errors on large payloads with
 * "Maximum array nesting exceeded" / body size limits).
 */
export async function POST(request: Request) {
  // Before the `try`: a fetch is owed a 401 it can read, not the 500 the catch would give.
  const account = await findCurrentAccount();
  if (!account)
    return NextResponse.json(
      { ok: false, error: "Sign in to import an Achieve outline." },
      { status: 401 },
    );
  const userId = account.id;
  try {
    const form = await request.formData();
    // Replace deletes the outline first, so it has to be asked for by name.
    const mode = parseImportMode(form.get("mode"));
    if (!mode) {
      return NextResponse.json(
        { ok: false, error: "Choose whether to merge or replace." },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Choose an Achieve XML file to import." },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { ok: false, error: "That file was empty." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "File is larger than 25 MB." },
        { status: 400 },
      );
    }

    const xml = await file.text();
    if (!xml.trim()) {
      return NextResponse.json(
        { ok: false, error: "That file was empty." },
        { status: 400 },
      );
    }

    const result = await importAchieveXml({ userId, xml, mode });
    revalidatePath("/", "layout");

    return NextResponse.json({
      ok: true,
      created: result.created,
      counts: result.counts,
      extras: result.extras,
      warnings: capWarnings(result.warnings),
      skippedTables: result.skippedTables,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: safeErrorMessage(error, "achieve.import", "Import failed."),
      },
      { status: 500 },
    );
  }
}
