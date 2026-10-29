#!/usr/bin/env node
/**
 * Run the whole suite with the clock moved forward, to find tests that will fail on a
 * calendar date with no code change.
 *
 * Usage: `npm run test:future` (45, 200 and 500 days ahead), or
 * `npm run test:future -- 7 31 2026-11-01T14:00:00Z` for chosen day offsets or instants.
 *
 * Why this exists: a test that reads the real clock against a hard-coded fixture date passes
 * until that date goes by, then fails the pre-push gate on an unchanged tree. That happened
 * on Oct 1 (the cutover budget test seeded September and read "this month") and Oct 10 (alert
 * holds aged against `new Date()`), each patched after it had already broken a push. Running
 * this before the date arrives finds the next one while it is still a choice when to fix it.
 * The fix is the one those two got: pass "today" in, rather than reading it inside the code
 * under test.
 *
 * Only JavaScript's `Date` moves (see `shift-clock.mjs`); Postgres's `now()` does not. So
 * `src/db/rawTypes.integration.test.ts`, which checks the database clock against the
 * process clock, is excluded: under a moved clock it fails by construction.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const preload = fileURLToPath(new URL("./shift-clock.mjs", import.meta.url));
const shifts = process.argv.slice(2);
const runs = shifts.length > 0 ? shifts : ["45", "200", "500"];

const suites = [
  ["vitest", "run", "--project", "unit", "--no-isolate"],
  [
    "vitest",
    "run",
    "--project",
    "integration",
    "--maxWorkers=8",
    "--exclude",
    "src/db/rawTypes.integration.test.ts",
  ],
];

const failed = [];
for (const shift of runs) {
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${preload}`.trim(),
    ...(/^-?\d+$/.test(shift) ? { CLOCK_SHIFT_DAYS: shift } : { CLOCK_NOW: shift }),
  };
  for (const args of suites) {
    const label = `${shift}${/^-?\d+$/.test(shift) ? " days" : ""} · ${args[3]}`;
    console.log(`\n=== clock ${label}`);
    const result = spawnSync("npx", args, { env, stdio: "inherit" });
    if (result.status !== 0) failed.push(label);
  }
}

if (failed.length > 0) {
  console.error(`\nFailed with the clock moved: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\nPassed with the clock moved: ${runs.join(", ")}`);
