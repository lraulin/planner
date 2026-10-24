/**
 * Which pages the browser may show again without asking the server, and for how long.
 *
 * Next can keep a dynamic page's payload in memory and reuse it on a revisit; it is off by
 * default (every page here is `force-dynamic`). Turning it on for the whole app would show a
 * page that has been written to since — this app has dozens of server actions that
 * deliberately revalidate nothing, because the view already patched its own copy. So caching
 * is **opt-in per route and fails closed**: this registry gives every page a policy, a page not
 * listed here is treated as `self-patching`, and a unit test fails when a `page.tsx` has no
 * entry or exports a stale time that disagrees with its policy.
 *
 * The three policies, and what each one makes the shell do:
 *
 * - **`cached`** — the payload may be reused for `CACHED_STALE_SECONDS`. The page exports
 *   `unstable_dynamicStaleTime = 60`. A page qualifies only if (a) its view keeps no locally
 *   patched copy of server data — every write it makes revalidates or refreshes the page — and
 *   (b) its server render reads no setting that a non-revalidating write changes.
 * - **`self-patching`** — never cached, and **leaving it marks the cache suspect**
 *   (`freshness.ts`): it may have written through an action that revalidates nothing, so a
 *   cached page that was fetched before you left it may be behind. Also never refreshed in
 *   place when the tab regains focus, because that reloads rows under an edit.
 * - **`uncached`** — never cached, and nothing about leaving it can make another page stale.
 *   Refreshed on focus return like a cached page. Redirects, focused flows and any page
 *   nobody has measured.
 *
 * **Writing a new page: start `uncached`**, and read `Writing a new write path` below before
 * adding an action that passes `revalidate: []`.
 */

export type CachePolicy = "cached" | "self-patching" | "uncached";

/** How long a `cached` page's payload is reused. One number: the export, the spec, the test. */
export const CACHED_STALE_SECONDS = 60;

type PolicyEntry = { policy: CachePolicy; reason: string };

/**
 * Keyed by route pattern: the URL with route groups removed and dynamic segments as `[name]`.
 * Every entry says why — a one-line reason is the price of a non-default policy, and the only
 * thing that lets the next person move a page between policies on evidence.
 *
 * ## Writing a new write path
 *
 * A server action that passes `revalidate: []` is a write the framework cannot see. The page
 * hosting it must be `self-patching` (or refresh itself after the write, as Budget's payee
 * merge does), or a cached page elsewhere will show data from before it. Leaving a
 * `self-patching` page is what protects the cached ones, which is why this is a page-level
 * rule and not a per-action one: the 45th action cannot forget to opt in.
 */
export const ROUTE_CACHE_POLICIES: Readonly<Record<string, PolicyEntry>> = {
  // ── Plan: one `loadOutline`, seven grids. Every write is a revalidating action. ──────────
  "/plan/overview": {
    policy: "cached",
    reason: "Read-mostly hub; every write revalidates.",
  },
  "/plan/outline": {
    policy: "cached",
    reason: "Every outline edit is a revalidating action.",
  },
  "/plan/projects": {
    policy: "cached",
    reason: "Same outline, same revalidating writes.",
  },
  "/plan/tasks": {
    policy: "cached",
    reason: "Same outline, same revalidating writes.",
  },
  "/plan/goals": {
    policy: "cached",
    reason: "Same outline, same revalidating writes.",
  },
  "/plan/wishes": {
    policy: "cached",
    reason: "Same outline, same revalidating writes.",
  },
  "/plan/result-areas": {
    policy: "cached",
    reason: "Same outline, same revalidating writes.",
  },
  "/chooser": {
    policy: "cached",
    reason: "Same outline; filters are client settings the server render never reads.",
  },

  // ── Finances ─────────────────────────────────────────────────────────────────────────
  "/finances/budget": {
    policy: "cached",
    reason:
      "Every write revalidates; the one that does not (payee merge) refreshes itself.",
  },
  "/finances/accounts": {
    policy: "cached",
    reason:
      "Every write revalidates; reads only the budget scope, written server-side.",
  },
  "/finances/bills": {
    policy: "cached",
    reason:
      "Every write revalidates; reads only the budget scope, written server-side.",
  },
  "/finances/register": {
    policy: "self-patching",
    reason: "Patches its own rows; categorise, split and edit pass `revalidate: []`.",
  },
  "/finances/supplies": {
    policy: "self-patching",
    reason: "Whole page is `revalidate: []` actions on a locally patched grid.",
  },
  "/finances/scenarios": {
    policy: "self-patching",
    reason: "Whole page is `revalidate: []` actions on a locally patched grid.",
  },
  "/finances/orders": {
    policy: "self-patching",
    reason: "Adds supplies from Amazon items through `revalidate: []` actions.",
  },
  "/finances/payees": {
    policy: "uncached",
    reason:
      "Merge is its one non-revalidating write and it refreshes; not a measured tab.",
  },
  "/finances/insights": {
    policy: "uncached",
    reason: "Read-only; not a measured tab.",
  },
  "/finances/activity": {
    policy: "uncached",
    reason: "Review surface; not a measured tab.",
  },
  "/finances/statements": { policy: "uncached", reason: "Not a measured tab." },
  "/finances": { policy: "uncached", reason: "Redirects to the remembered page." },
  "/finances/dashboard": { policy: "uncached", reason: "Redirect only." },

  // ── Notes ────────────────────────────────────────────────────────────────────────────
  "/notes/grid": {
    policy: "self-patching",
    reason:
      "Autosaves through `revalidate: []`; its render reads the saved filter scope.",
  },
  "/notes/journal": {
    policy: "self-patching",
    reason: "Autosaves the day's entry through `revalidate: []`.",
  },
  "/notes": { policy: "uncached", reason: "Redirects to the remembered page." },

  // ── Library ──────────────────────────────────────────────────────────────────────────
  "/library/contacts": {
    policy: "self-patching",
    reason: "Local-first background sync passes no revalidation, then refreshes once.",
  },
  "/library/brain": { policy: "uncached", reason: "Not a measured tab." },
  "/library/houses": { policy: "uncached", reason: "Not a measured tab." },
  "/library/jobs": { policy: "uncached", reason: "Not a measured tab." },
  "/library/residences": { policy: "uncached", reason: "Not a measured tab." },
  "/library/resources": { policy: "uncached", reason: "Not a measured tab." },
  "/library/timeline": { policy: "uncached", reason: "Not a measured tab." },
  "/library": { policy: "uncached", reason: "Redirects to the remembered page." },

  // ── Schedule ─────────────────────────────────────────────────────────────────────────
  "/schedule/calendar": {
    policy: "uncached",
    reason:
      "Server render reads the day-count scope, which client settings writes change.",
  },
  "/schedule/agenda": {
    policy: "uncached",
    reason:
      "Server render reads the day-count scope, which client settings writes change.",
  },
  "/schedule/day": {
    policy: "uncached",
    reason: "Time-dependent; not a measured tab.",
  },
  "/schedule/week-plan": {
    policy: "uncached",
    reason: "Time-dependent; not a measured tab.",
  },
  "/schedule/plan": { policy: "uncached", reason: "Focused flow (the weekly wizard)." },
  "/schedule/time-charts": { policy: "uncached", reason: "Not a measured tab." },
  "/schedule/time-chart/[chartId]": {
    policy: "uncached",
    reason: "Editor; focused flow.",
  },
  "/schedule": { policy: "uncached", reason: "Redirects to the remembered page." },

  // ── Fitness ──────────────────────────────────────────────────────────────────────────
  "/fitness/sessions": { policy: "uncached", reason: "Not a measured tab." },
  "/fitness/exercises": { policy: "uncached", reason: "Not a measured tab." },
  "/fitness/sessions/[sessionId]": {
    policy: "uncached",
    reason: "Editor; every save revalidates, so it already survives a refresh.",
  },
  "/fitness/exercises/[exerciseId]": {
    policy: "uncached",
    reason: "Editor; focused flow.",
  },
  "/fitness/exercises/new": { policy: "uncached", reason: "Editor; focused flow." },
  "/fitness/log": { policy: "uncached", reason: "Focused flow (logging a workout)." },
  "/fitness": { policy: "uncached", reason: "Redirects to the remembered page." },

  // ── Everything else inside the shell ─────────────────────────────────────────────────
  "/metrics": { policy: "uncached", reason: "Not a measured tab." },
  "/find": {
    policy: "uncached",
    reason: "Search results are one-off; fresh is the point.",
  },
  "/organize": { policy: "uncached", reason: "Focused flow (Process Inbox)." },
  "/plan": { policy: "uncached", reason: "Redirects to the remembered page." },

  // ── Outside the shell ────────────────────────────────────────────────────────────────
  "/": { policy: "uncached", reason: "Redirects into the app." },
  "/login": { policy: "uncached", reason: "Outside the shell." },
  "/signup": { policy: "uncached", reason: "Outside the shell." },
  "/oauth/authorize": { policy: "uncached", reason: "Outside the shell." },
  "/settings": {
    policy: "uncached",
    reason: "Outside the shell; shows what its own panels write.",
  },

  // ── Legacy paths: redirects only, no payload ─────────────────────────────────────────
  "/contacts": { policy: "uncached", reason: "Legacy redirect." },
  "/day": { policy: "uncached", reason: "Legacy redirect." },
  "/day/week": { policy: "uncached", reason: "Legacy redirect." },
  "/goals": { policy: "uncached", reason: "Legacy redirect." },
  "/outline": { policy: "uncached", reason: "Legacy redirect." },
  "/overview": { policy: "uncached", reason: "Legacy redirect." },
  "/projects": { policy: "uncached", reason: "Legacy redirect." },
  "/resources": { policy: "uncached", reason: "Legacy redirect." },
  "/result-areas": { policy: "uncached", reason: "Legacy redirect." },
  "/tasks": { policy: "uncached", reason: "Legacy redirect." },
  "/time-charts": { policy: "uncached", reason: "Legacy redirect." },
  "/wishes": { policy: "uncached", reason: "Legacy redirect." },
};

/** Whether `pathname` is an instance of route `pattern` (`[name]` matches one segment). */
function matches(pattern: string, pathname: string): boolean {
  const want = pattern.split("/");
  const have = pathname.split("/");
  if (want.length !== have.length) return false;
  return want.every(
    (segment, index) =>
      (segment.startsWith("[") && segment.endsWith("]") && have[index] !== "") ||
      segment === have[index],
  );
}

/**
 * The policy for a pathname. A path no entry names is `self-patching`: the pessimistic
 * answer, so a page added without a registry entry is never cached and always protects the
 * ones that are.
 */
export function cachePolicyFor(path: string): CachePolicy {
  const pathname = (path.split(/[?#]/)[0] ?? path).replace(/(.)\/$/, "$1");
  const exact = ROUTE_CACHE_POLICIES[pathname];
  if (exact) return exact.policy;
  for (const [pattern, entry] of Object.entries(ROUTE_CACHE_POLICIES)) {
    if (pattern.includes("[") && matches(pattern, pathname)) return entry.policy;
  }
  return "self-patching";
}
