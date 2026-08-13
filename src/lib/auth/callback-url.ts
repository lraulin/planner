/**
 * Only allow same-origin relative paths as post-login redirects.
 * Rejects protocol-relative URLs and absolute URLs (open redirect).
 *
 * The fallback is the Plan entry point rather than a page inside it, so signing in lands you
 * where `/` does — on the page you were last on. It was `/outline` while Outline was a module.
 */
const DEFAULT_PATH = "/plan";

export function safeCallbackPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PATH;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_PATH;
  }
  // Block backslash tricks and control characters.
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return DEFAULT_PATH;
  }
  return value;
}
