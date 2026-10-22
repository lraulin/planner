#!/usr/bin/env node
/**
 * How many database round trips does each page wait for, one after another?
 *
 * That number is what a page costs in production and it is invisible everywhere else: lint,
 * typecheck, the tests and local development all behave identically whether a page makes
 * seven sequential round trips or forty-seven, because local Postgres has no latency to
 * multiply. The Bills page reached forty-seven before anyone looked.
 *
 * Each route is loaded twice through `pg-latency-proxy.mjs`, once with no delay and once
 * with one, and the difference divided by the round-trip time is the length of the longest
 * chain of queries that waited on each other. Queries issued together count once.
 *
 *   npm run dev:latency     # the dev server, pointed at the proxy's port — start this second
 *   npm run perf:routes     # this script, which is also the proxy — start this first
 *
 * `perf:routes` waits for the dev server, so the order only matters in that the server
 * cannot connect until the proxy is listening. Pass a substring to measure some routes:
 * `npm run perf:routes -- finances`.
 *
 * Needs the dev login bypass (`AUTH_DEV_BYPASS=true`), like `npm run smoke`, so the floor it
 * reports is the bypass's: 2, a user lookup then the settings read. Signed in for real it is
 * about 4, a session read and a user read before the settings.
 */

import { pageRoutes } from "./page-routes.mjs";
import { startLatencyProxy } from "./pg-latency-proxy.mjs";

const BASE = process.env.PLANNER_URL ?? "http://localhost:3047";
/** One way. Large enough to stand clear of render-time noise, small enough to finish. */
const DELAY_MS = 10;
const filter = process.argv[2];

const proxy = await startLatencyProxy();

async function load(path) {
  const started = performance.now();
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  await response.text();
  return { ms: performance.now() - started, status: response.status };
}

async function fastest(path, runs) {
  let best = Infinity;
  for (let run = 0; run < runs; run++) best = Math.min(best, (await load(path)).ms);
  return best;
}

async function waitForServer() {
  console.log(
    `perf: proxy is listening on 5433. Waiting for ${BASE} — npm run dev:latency`,
  );
  for (;;) {
    try {
      proxy.take();
      await load("/settings");
      if (proxy.take().statements > 0) return;
      console.error(
        `\nperf: ${BASE} answered without touching the proxy, so it is connected straight to` +
          `\nPostgres and there is nothing to measure. Stop it and run: npm run dev:latency`,
      );
      process.exit(1);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

await waitForServer();

const rows = [];
for (const path of pageRoutes().filter((route) => !filter || route.includes(filter))) {
  proxy.setDelay(0);
  // The first request compiles the route; a redirect is another route's business.
  if ((await load(path)).status !== 200) continue;
  await load(path);
  proxy.take();
  const direct = await fastest(path, 3);
  const { statements, describes } = proxy.take();

  proxy.setDelay(DELAY_MS);
  // Once unmeasured, so connections opened under the delay are not charged to the page.
  await load(path);
  const delayed = await fastest(path, 3);

  const row = {
    path,
    sequential: Math.round((delayed - direct) / (2 * DELAY_MS)),
    queries: Math.round(statements / 3),
    describes: Math.round(describes / 3),
    renderMs: Math.round(direct),
  };
  rows.push(row);
  console.log(
    `  ${row.path.padEnd(32)} ${String(row.sequential).padStart(3)} in sequence` +
      `  ${String(row.queries).padStart(3)} queries  ${String(row.renderMs).padStart(4)} ms unslowed`,
  );
}
proxy.setDelay(0);

const worst = [...rows].sort((a, b) => b.sequential - a.sequential).slice(0, 5);
console.log(
  `\nperf: longest chains — ${worst.map((r) => `${r.path} ${r.sequential}`).join(", ")}`,
);
const describes = rows.reduce((total, row) => total + row.describes, 0);
const queries = rows.reduce((total, row) => total + row.queries, 0);
// Always printed: zero is the claim worth seeing. node-postgres binds in the same flight as
// the parse; postgres.js described every parameterised statement in a trip of its own.
console.log(`perf: ${describes} of ${queries} queries made a separate describe trip.`);
if (queries > 0 && describes / queries > 0.5) {
  console.log(
    `perf: the driver is costing two round trips a query, and "in sequence" counts both.`,
  );
}
proxy.close();
process.exit(0);
