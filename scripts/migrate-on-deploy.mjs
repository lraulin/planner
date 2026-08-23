import { spawnSync } from "node:child_process";

/**
 * Applies pending migrations during a Vercel **production** build, and does nothing anywhere
 * else.
 *
 * This exists because the schema and the code deploy together but the database did not:
 * pushing the detail-forms work shipped code that queried `project_details` while Neon had
 * never been migrated, and every drawer on production failed. Running migrations as part of
 * the deploy is what keeps the two in step.
 *
 * The `VERCEL_ENV` guard is the important part. Preview deployments share this one Neon
 * database — there is no branch-per-preview — so an unguarded migration step would let a
 * push to any branch reshape production's schema.
 */
const env = process.env.VERCEL_ENV;

if (env !== "production") {
  console.log(`[migrate] Skipped: VERCEL_ENV is ${env ?? "unset"}, not "production".`);
  process.exit(0);
}

if (!process.env.DIRECT_DATABASE_URL && !process.env.DATABASE_URL) {
  console.error(
    "[migrate] No DIRECT_DATABASE_URL or DATABASE_URL set for a production build.",
  );
  process.exit(1);
}

if (!process.env.DIRECT_DATABASE_URL) {
  // Not fatal — Neon's pooler usually copes — but the failure it causes is obscure enough
  // to be worth naming in the build log before it happens.
  console.warn(
    "[migrate] DIRECT_DATABASE_URL is unset; migrating over the pooled connection.",
  );
}

console.log("[migrate] Applying pending migrations to production…");

const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});

// Fail the build rather than deploy code whose tables do not exist yet.
if (result.status !== 0) process.exit(result.status ?? 1);

/**
 * One deployment-scoped bridge for the payee matcher cutover.
 *
 * Sensitive Vercel variables cannot be exported to a local process, so the audited CLI has
 * to run where the production connection already exists. The explicit mode keeps ordinary
 * deploys inert. Remove this seam with Stage B after the production apply and replay.
 */
const payeeCutoverMode = process.env.PAYEE_CUTOVER_MODE;
if (payeeCutoverMode === undefined || payeeCutoverMode === "") process.exit(0);
if (payeeCutoverMode !== "dry-run" && payeeCutoverMode !== "apply") {
  console.error(
    '[payee-cutover] PAYEE_CUTOVER_MODE must be "dry-run", "apply", or unset.',
  );
  process.exit(1);
}

console.log(`[payee-cutover] Running production ${payeeCutoverMode}…`);
const cutoverArgs = ["tsx", "scripts/cutover-payee-matchers.mts"];
if (payeeCutoverMode === "apply") cutoverArgs.push("--apply");
const cutover = spawnSync("npx", cutoverArgs, {
  stdio: "inherit",
  env: process.env,
});
process.exit(cutover.status ?? 1);
