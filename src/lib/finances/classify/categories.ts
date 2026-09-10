/**
 * What a row is called when nothing has categorised it.
 *
 * This file used to hold the hard-coded spending taxonomy and the map from each bank's own
 * vocabulary onto it. `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D9.6
 * retired both — the envelope a transaction is filed into *is* its category now, and D9.7
 * keeps an imported `source_category` "as provenance only. It must not influence
 * categorisation." Only this constant survived the cutover.
 */

/** Shown wherever nothing classified a row. Not a member of any taxonomy — it is the
 * absence of one, and reports should be able to say how much of the total it covers. */
export const UNCATEGORIZED = "Uncategorized";
