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
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
