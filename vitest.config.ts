import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Integration tests talk to the local Postgres from docker-compose. Unit tests ignore this.
config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests share one database, so run files serially to keep them isolated.
    fileParallelism: false,
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
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
