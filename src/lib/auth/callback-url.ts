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
