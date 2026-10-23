import { internalPath } from "@/lib/navigation/internalPath";

/**
 * Only allow same-origin relative paths as post-login redirects — see `internalPath`.
 *
 * The fallback is the Plan entry point rather than a page inside it, so signing in lands you
 * where `/` does — on the page you were last on. It was `/outline` while Outline was a module.
 */
const DEFAULT_PATH = "/plan";

export function safeCallbackPath(raw: string | null | undefined): string {
  return internalPath(raw) ?? DEFAULT_PATH;
}

/**
 * Where to send a request whose session has lapsed: `/login`, carrying the page it was for.
 *
 * Pages under `/login` and `/signup` never become the callback — signing in would land
 * back on the form — and neither does anything `internalPath` refuses, so a forged
 * `x-pathname` cannot turn this into an open redirect.
 */
export function loginPathFor(returnTo: string | null | undefined): string {
  const path = internalPath(returnTo);
  if (!path || path === "/" || /^\/(login|signup)(\/|\?|$)/.test(path)) return "/login";
  return `/login?${new URLSearchParams({ callbackUrl: path }).toString()}`;
}
