/**
 * Local-development login bypass.
 *
 * Signing in is friction on a machine where the only account is your own — and it blocks
 * the browser driver in `.claude/skills/run-planner`, which starts from a cold profile
 * with no session cookie every run.
 *
 * **Two independent gates**, both of which must pass, because the failure mode here is an
 * unauthenticated production app:
 *
 * 1. `NODE_ENV` is not `production` — inlined at build time, so a production bundle cannot
 *    be talked into this by an environment variable at runtime.
 * 2. `AUTH_DEV_BYPASS` is exactly `"true"` — opt-in, never a default. A missing, empty, or
 *    misspelled value leaves the bypass off.
 *
 * When on, `getCurrentUserId()` resolves to the owner account instead of throwing, and the
 * middleware stops redirecting to `/login`. Signing in normally still works.
 */
export function devAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AUTH_DEV_BYPASS === "true";
}
