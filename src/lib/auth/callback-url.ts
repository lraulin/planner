/**
 * Only allow same-origin relative paths as post-login redirects.
 * Rejects protocol-relative URLs and absolute URLs (open redirect).
 */
export function safeCallbackPath(raw: string | null | undefined): string {
  if (!raw) return "/outline";
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/outline";
  }
  // Block backslash tricks and control characters.
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return "/outline";
  }
  return value;
}
