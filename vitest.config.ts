import { defineConfig, configDefaults } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Integration tests talk to the local Postgres from docker-compose. Unit tests ignore this.
config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      /**
       * Pin the wall clock. Calendar days are stored UTC-noon and read with `toDateKey`, so
       * most of the suite does not care — but the tests that are *about* local time do, and
       * they were all written here: `expandRecurrence` asserts that 09:00 stays 09:00 across
       * the US spring-forward, and `geometry` has the Aug 1 → Jul 31 regression that only
       * reproduces at a negative offset. Left to the ambient zone they passed in the
       * Americas and failed everywhere else, including under UTC, which is what a CI runner
       * and a Vercel build use. See `agent-os/standards/development/dates.md`.
       */
      TZ: "America/New_York",
    },
    /**
     * Two suites with two different isolation requirements, so they are two named projects
     * rather than one glob. Both run their files in parallel: every integration file creates
     * its own users with `crypto.randomUUID()` emails and drops them in `afterAll`, so files
     * never contend for shared rows.
     *
     * Isolation and worker count are deliberately *not* set here. Vitest 3.2.7 builds a single
     * Tinypool from the root config, so `isolate` and `poolOptions.forks.*` are per-process,
     * not per-project — set on a project they are accepted and silently ignored (verified:
     * `maxForks: 1` on this project still ran 8-way). They live on the `test:unit` and
     * `test:integration` invocations in package.json instead, which is why `npm test` chains
     * those two scripts rather than running one vitest.
     */
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
