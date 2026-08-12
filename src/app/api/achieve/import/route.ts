import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { importAchieveXml, type ImportMode } from "@/lib/achieve/import";
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
  try {
    const userId = await getCurrentUserId();
    const form = await request.formData();
    const modeRaw = String(form.get("mode") ?? "replace");
    const mode: ImportMode = modeRaw === "merge" ? "merge" : "replace";

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

    // Cap warnings in the response so a chatty import does not balloon the JSON.
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
      counts: result.counts,
      extras: result.extras,
      warnings,
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
