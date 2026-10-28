import { loadHealth } from "@/lib/health/queries";

/**
 * Public health probe: GET /api/health
 *
 * No auth, by design — the weekly production check and any uptime monitor call it from
 * outside — so it says only whether the database answered, which commit is live, and how
 * stale each scheduled sync is (`src/lib/health/report.ts`). 503 when the database does not
 * answer; 200 otherwise, with `status: "degraded"` when a sync has gone stale.
 */
export async function GET() {
  const report = await loadHealth(new Date());
  return Response.json(report, {
    status: report.status === "down" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
