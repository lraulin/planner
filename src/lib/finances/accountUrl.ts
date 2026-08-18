/**
 * User-owned deep link from a register account to that account at the bank.
 *
 * Only https hosts we actually have accounts at. A free-text URL field next to bank
 * credentials is otherwise a stored-XSS and an open-redirect in one.
 */

const ALLOWED_HOSTS = new Set([
  "myaccounts.capitalone.com",
  "secure.chase.com",
  "www.chase.com",
  "chase.com",
]);

/**
 * Accept a bank account URL, or the empty string to clear one. `null` means refuse.
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
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  return trimmed;
}
