#!/usr/bin/env node
import pg from "pg";

/**
 * What one reconnect costs, in round trips, against a real database — Neon's pooled endpoint
 * above all.
 *
 * The pool's `idleTimeoutMillis` (`src/db/pool.ts`) trades connections held open against
 * reconnects paid after a pause. It was set to 60 s on the estimate that a reconnect is about
 * five round trips: SSLRequest, the TLS handshake, startup, and two SCRAM steps. The TLS part
 * of that is protocol arithmetic, not a measurement, and the pooler may add its own. This
 * measures it, as a ratio, so it holds from any machine:
 *
 *   reconnect cost (trips) = median(connect + one query) / median(one query on a warm client) − 1
 *
 * The connect side includes CPU as well as flights — SCRAM's password hashing is deliberately
 * slow — and that is time a reconnect really spends, so read the result as "a reconnect costs
 * as much as N round trips", not as a count of packets. Against local Postgres the ratio is
 * meaningless (a 0.3 ms trip against milliseconds of hashing); it is meant for a remote host.
 * The milliseconds printed are from wherever this runs. From elsewhere than iad1 the ratio is
 * the rougher but more portable figure: multiply it by about 4.5 ms, a trip from iad1 to Neon.
 *
 *   DATABASE_URL='postgresql://…-pooler…/planner?sslmode=verify-full' node scripts/pg-reconnect-cost.mjs
 *
 * Read-only: every statement is `select 1`. The first connection is thrown away, since it can
 * include waking a suspended Neon compute, which is a different cost from a reconnect.
 * Prints nothing that identifies the database beyond its host.
 */

const RUNS = Number(process.argv[2] ?? 15);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the connection string to measure.");
  process.exit(1);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function client() {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  // A dropped connection with no listener is an uncaught exception, not a measurement.
  c.on("error", () => {});
  return c;
}

async function coldQuery() {
  const c = client();
  const started = performance.now();
  await c.connect();
  await c.query("select 1");
  const ms = performance.now() - started;
  await c.end();
  return ms;
}

await coldQuery(); // wake the compute

const cold = [];
for (let run = 0; run < RUNS; run++) cold.push(await coldQuery());

const warmClient = client();
await warmClient.connect();
await warmClient.query("select 1");
const warm = [];
for (let run = 0; run < RUNS; run++) {
  const started = performance.now();
  await warmClient.query("select 1");
  warm.push(performance.now() - started);
}
await warmClient.end();

const coldMs = median(cold);
const tripMs = median(warm);
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "DATABASE_URL";
  }
})();

console.log(`host                     ${host}`);
console.log(`runs                     ${RUNS} each`);
console.log(`one query, warm client   ${tripMs.toFixed(1)} ms (one round trip)`);
console.log(`connect + one query      ${coldMs.toFixed(1)} ms`);
console.log(
  `reconnect costs as much as ${(coldMs / tripMs - 1).toFixed(1)} round trips`,
);
