/**
 * Parse a fetch Response as JSON, including when the server never reached our route.
 *
 * Next's proxy clones every request body (see `proxy.ts`) and, above its size cap,
 * either truncates the stream or answers with a plain-text 413
 * ("Request Entity Too Large"). `response.json()` then throws
 * `Unexpected token 'R', "Request En"... is not valid JSON` — which is what the
 * finances import panel showed. This helper turns that into a sentence about the
 * upload, and any other non-JSON body into the status plus a short snippet.
 */
export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (text === "") {
    throw new Error(`Empty response (${response.status}).`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
    if (response.status === 413 || /entity too large/i.test(snippet)) {
      throw new Error(
        "That upload is larger than the server will accept in one go. Select fewer files.",
      );
    }
    throw new Error(`Import failed (${response.status}): ${snippet}`);
  }
}
