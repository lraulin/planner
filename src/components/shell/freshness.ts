import { createFreshnessTracker } from "@/lib/navigation/freshness";

/**
 * The tab's one freshness tracker: when each rendered payload was first seen and whether the
 * cache is suspect. Module-level for the same reason `pendingNavigation` is — its writers are
 * the layout's epoch marker, each cached page's stamp, and the shell's focus handler, which
 * share no provider. The rules live in `lib/navigation/freshness.ts`.
 */
export const freshness = createFreshnessTracker();
