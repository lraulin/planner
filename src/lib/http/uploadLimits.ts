/**
 * Platform request-body ceilings for multipart imports.
 *
 * Vercel Functions 413 a body over 4.5 MB before our route sees it. Next's proxy
 * (`proxyClientMaxBodySize`) and the per-route totals are larger, so packing against
 * those unused numbers is how a folder of statements never reaches `/api/finances/import`.
 */

/** Vercel Functions reject a request body over 4.5 MB with a 413. */
export const VERCEL_BODY_MAX_BYTES = Math.floor(4.5 * 1024 * 1024);

/**
 * How much file payload one POST may carry. Smaller than the 4.5 MB ceiling so
 * multipart boundaries and field names do not push a packed batch over the 413.
 */
export const UPLOAD_BATCH_BUDGET_BYTES = 4 * 1024 * 1024;
