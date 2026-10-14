import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CACHED_STALE_SECONDS,
  ROUTE_CACHE_POLICIES,
  cachePolicyFor,
} from "./cachePolicy";

const APP = join(process.cwd(), "src", "app");

/** Every `page.tsx` under `src/app` with its route pattern and source. */
function pages(dir = APP): { route: string; file: string; source: string }[] {
  const found: { route: string; file: string; source: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...pages(full));
    } else if (entry.name === "page.tsx") {
      const segments = relative(APP, dir)
        .split(sep)
        .filter((segment) => segment !== "" && !/^\(.*\)$/.test(segment));
      found.push({
        route: `/${segments.join("/")}`,
        file: relative(process.cwd(), full),
        source: readFileSync(full, "utf8"),
      });
    }
  }
  return found;
}

/**
 * The `unstable_dynamicStaleTime` literal a page exports, or `null` for none.
 *
 * Next analyses segment config statically, so the number has to be a literal in the page — it
 * cannot be derived from the registry at build time. This is the only thing tying the two
 * together, and it reads source text for that reason.
 */
function exportedStaleTime(source: string): number | null {
  const match = /export\s+const\s+unstable_dynamicStaleTime\s*=\s*(\d+)\s*;/.exec(
    source,
  );
  return match ? Number(match[1]) : null;
}

describe("route cache policy registry", () => {
  const all = pages();

  it("finds the pages (a path bug here would make every check below vacuous)", () => {
    expect(all.length).toBeGreaterThan(50);
    expect(all.map((page) => page.route)).toContain("/finances/budget");
  });

  it("gives every page.tsx an entry", () => {
    const missing = all.filter((page) => !(page.route in ROUTE_CACHE_POLICIES));
    expect(missing.map((page) => `${page.route} (${page.file})`)).toEqual([]);
  });

  it("has no entry for a route that no page serves", () => {
    const routes = new Set(all.map((page) => page.route));
    const stale = Object.keys(ROUTE_CACHE_POLICIES).filter(
      (route) => !routes.has(route),
    );
    expect(stale).toEqual([]);
  });

  it("exports the stale time exactly for the pages that are cached", () => {
    const disagreements = all
      .map((page) => {
        const policy = ROUTE_CACHE_POLICIES[page.route]?.policy;
        const exported = exportedStaleTime(page.source);
        const expected = policy === "cached" ? CACHED_STALE_SECONDS : null;
        // An explicit 0 is the same as none: the client treats it as "never reuse".
        const actual = exported === 0 ? null : exported;
        return actual === expected
          ? null
          : `${page.route}: policy ${policy}, exports ${String(exported)}`;
      })
      .filter((line): line is string => line !== null);
    expect(disagreements).toEqual([]);
  });

  it("puts a PageStamp in every cached page, or its arrival refresh never runs", () => {
    const unstamped = all
      .filter((page) => ROUTE_CACHE_POLICIES[page.route]?.policy === "cached")
      .filter((page) => !page.source.includes("<PageStamp />"))
      .map((page) => page.route);
    expect(unstamped).toEqual([]);
  });

  it("gives every entry a reason", () => {
    for (const [route, entry] of Object.entries(ROUTE_CACHE_POLICIES)) {
      expect(entry.reason.trim().length, route).toBeGreaterThan(8);
    }
  });
});

describe("cachePolicyFor", () => {
  it("reads the policy for a concrete page", () => {
    expect(cachePolicyFor("/plan/tasks")).toBe("cached");
    expect(cachePolicyFor("/finances/register")).toBe("self-patching");
    expect(cachePolicyFor("/schedule/plan")).toBe("uncached");
  });

  it("ignores the query string, a trailing slash and the hash", () => {
    expect(cachePolicyFor("/finances/budget?month=2026-09")).toBe("cached");
    expect(cachePolicyFor("/finances/budget/")).toBe("cached");
    expect(cachePolicyFor("/notes/journal#today")).toBe("self-patching");
  });

  it("matches a dynamic segment to its pattern", () => {
    expect(cachePolicyFor("/schedule/time-chart/3f2a")).toBe("uncached");
    expect(cachePolicyFor("/fitness/sessions/abc")).toBe("uncached");
  });

  it("fails closed: a page nobody listed is self-patching, so it is never cached", () => {
    expect(cachePolicyFor("/a-page-added-last-week")).toBe("self-patching");
    expect(cachePolicyFor("/plan/not-a-plan-page")).toBe("self-patching");
  });
});
