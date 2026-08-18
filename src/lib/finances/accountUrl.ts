/**
 * User-owned deep link from a register account to that account at the bank.
 *
 * https only: a free-text href next to money is otherwise stored XSS and an open
 * redirect in one. The host is not allowlisted — adding a bank is pasting its URL,
 * not a code change. `javascript:` and `http:` fail closed.
 */

/**
 * Accept an https account URL, or the empty string to clear one. `null` means refuse.
 *
 * The original string is returned, not `url.href`: Capital One paths contain `+` and `=`,
 * and Chase's deep link lives in the hash. `URL` would decode or drop those.
 */
export function parseAccountUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return trimmed;
}
