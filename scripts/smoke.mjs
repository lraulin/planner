#!/usr/bin/env node
/**
 * Load every page against a running dev server and fail if any of them errors.
 *
 * This exists because of a class of bug that the whole rest of the gate misses. A server
 * module can compile, typecheck, satisfy eslint, pass 2000 tests and build cleanly, and
 * still throw the moment it is *evaluated* — and nothing before this point evaluates it:
 * the unit tests never import a `"use server"` module, and `next build` compiles the routes
 * without rendering them because every page here is `force-dynamic`. That combination
 * shipped a `ReferenceError` on every page once already.
 *
 * Deliberately shallow: it asks each route for its HTML and checks the status. It does not
 * click anything. Interaction bugs, hydration errors and client-only exceptions are out of
 * scope — those need a browser, which is what `.claude/skills/run-planner/driver.mjs` is
 * for. What this catches is "the server cannot render this page at all", which is the
 * expensive kind to discover in production.
 *
 * Needs the dev server, not a production one: `next start` cannot use the login bypass
 * (`src/lib/auth/dev-bypass.ts` gates it on `NODE_ENV`, inlined at build time), so every
 * route there answers 307 to `/login` and the check would prove nothing.
 *
 *   npm run dev            # in another shell
 *   npm run smoke
 *
 * `PLANNER_URL` overrides the base URL.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PLANNER_URL ?? "http://localhost:3047";
/** Dev compiles a route on first request, which is slow but bounded. */
const TIMEOUT_MS = 60_000;

/**
 * Every static page route, from the filesystem rather than a hand-kept list — a new route
 * is covered the day it is added, which a list would not be.
 *
 * Dynamic segments are skipped: `/fitness/exercises/[exerciseId]` needs an id that only the
 * database can supply, and inventing one tests the not-found path rather than the page.
 */
function routes(dir = "src/app", prefix = "") {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") {
      found.push(prefix === "" ? "/" : prefix);
      continue;
    }
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    // Private folders and route handlers hold no pages; dynamic segments need real ids.
    if (name.startsWith("_") || name.startsWith("[") || name === "api") continue;
    // A route group `(marketing)` is a folder that contributes nothing to the URL.
    const segment = name.startsWith("(") && name.endsWith(")") ? "" : `/${name}`;
    found.push(...routes(join(dir, name), `${prefix}${segment}`));
  }
  return found;
}

async function check(path) {
  const url = `${BASE}${path}`;
  let response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return { path, ok: false, detail: `request failed: ${error.message}` };
  }

  if (response.status === 307 || response.status === 302) {
    const target = response.headers.get("location") ?? "?";
    // A bounce to /login means the dev bypass is off, which makes every later result
    // meaningless. Called out separately so it does not read as a broken page.
    if (new URL(target, BASE).pathname === "/login") {
      return { path, ok: false, setup: true, detail: `${response.status} → ${target}` };
    }
    // Any other redirect is the app routing on purpose — `/` sends you to `/outline`. The
    // destination is a route in its own right, so it is checked on its own line.
    return { path, ok: true, note: `→ ${target}` };
  }
  if (response.status !== 200) {
    return { path, ok: false, detail: `HTTP ${response.status}` };
  }

  // A page whose error was caught by an error boundary still answers 200; Next marks the
  // streamed payload, so the body is the only place that failure shows.
  const body = await response.text();
  if (body.includes("__next_error__")) {
    return { path, ok: false, detail: "rendered Next's error boundary (200)" };
  }
  return { path, ok: true };
}

const paths = routes().sort();
console.log(`smoke: ${paths.length} routes against ${BASE}\n`);

const failures = [];
for (const path of paths) {
  const result = await check(path);
  const suffix = result.ok
    ? result.note
      ? `  ${result.note}`
      : ""
    : `  — ${result.detail}`;
  console.log(`  ${result.ok ? "✓" : "✗"} ${path}${suffix}`);
  if (!result.ok) failures.push(result);
}

if (failures.length === 0) {
  console.log(`\nsmoke: all ${paths.length} routes rendered.`);
  process.exit(0);
}

if (failures.every((f) => f.setup)) {
  console.error(
    `\nsmoke: every route redirected — the dev login bypass is off.` +
      `\nSet AUTH_DEV_BYPASS=true in .env.local and restart the dev server.`,
  );
  process.exit(1);
}

console.error(`\nsmoke: ${failures.length} of ${paths.length} routes failed.`);
process.exit(1);
