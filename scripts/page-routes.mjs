import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every static page route, sorted, from the filesystem rather than a hand-kept list — a new
 * route is covered the day it is added, which a list would not be.
 *
 * Dynamic segments are skipped: `/fitness/exercises/[exerciseId]` needs an id that only the
 * database can supply, and inventing one tests the not-found path rather than the page.
 */
export function pageRoutes(dir = "src/app") {
  return walk(dir, "").sort();
}

function walk(dir, prefix) {
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
    found.push(...walk(join(dir, name), `${prefix}${segment}`));
  }
  return found;
}
