import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { importAmazonSlim } from "@/lib/amazon/import";
import { safeErrorMessage } from "@/lib/security/safeError";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * POST multipart form: one slim Amazon JSON (`version: 1`, `source: amazon-data-request`).
 * The zip is never accepted — preprocess it locally first.
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("multipart/form-data")
    ) {
      return validation("Send the slim JSON as multipart form data.");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return validation("Choose an Amazon orders JSON file.");
    }
    if (file.size > MAX_FILE_BYTES) {
      return validation(`"${file.name}" is larger than 10 MB.`);
    }

    const text = await file.text();
    const result = await importAmazonSlim({ userId, text });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.message.toLowerCase().startsWith("unauthorized");
    const message = error instanceof Error ? error.message : "";
    const badSlim =
      message.startsWith("Not an Amazon") ||
      message.startsWith("That file") ||
      message.startsWith("Slim file");
    if (badSlim) return validation(message);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: unauthorized ? "unauthorized" : "internal",
          message: unauthorized
            ? "Sign in to import Amazon orders."
            : safeErrorMessage(error, "amazon.import", "Amazon import failed."),
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
