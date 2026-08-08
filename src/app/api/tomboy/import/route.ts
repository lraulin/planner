import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { importTomboyFiles } from "@/lib/tomboy/import";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 600;

/** POST multipart form: `.note` files selected directly or from a Tomboy sync folder. */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("multipart/form-data")
    ) {
      return validation("Send Tomboy files as multipart form data.");
    }
    const form = await request.formData();
    const rawFiles = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);

    if (rawFiles.length === 0)
      return validation("Choose Tomboy .note files or a folder.");
    if (rawFiles.length > MAX_FILES) {
      return validation(`Too many selected files (max ${MAX_FILES}).`);
    }

    let totalBytes = 0;
    const files: { name: string; text: string }[] = [];
    for (const file of rawFiles) {
      if (file.size === 0) continue;
      if (file.size > MAX_FILE_BYTES) {
        return validation(`"${file.name}" is larger than 2 MB.`);
      }
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return validation("The selected files are larger than 25 MB in total.");
      }
      files.push({ name: file.name, text: await file.text() });
    }

    if (files.length === 0) return validation("The selected files were empty.");
    if (!files.some((file) => file.name.toLowerCase().endsWith(".note"))) {
      return validation("No Tomboy .note files were found in the selection.");
    }

    const result = await importTomboyFiles({ userId, files });
    revalidatePath("/", "layout");

    const warnings =
      result.warnings.length > 50
        ? [
            ...result.warnings.slice(0, 50),
            `…and ${result.warnings.length - 50} more warnings`,
          ]
        : result.warnings;

    return NextResponse.json({ ok: true, data: { ...result, warnings } });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.message.toLowerCase().startsWith("unauthorized");
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : "internal",
          message: unauthorized
            ? "Sign in to import Tomboy notes."
            : "Tomboy import failed.",
        },
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
}

function validation(message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: "validation", message } },
    { status: 400 },
  );
}
