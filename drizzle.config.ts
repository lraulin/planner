import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// No-ops on Vercel, where there is no .env.local and the values come from the environment.
config({ path: ".env.local" });

/**
 * Migrations prefer the direct connection. Neon's pooled endpoint runs in transaction mode,
 * which is the wrong place to send a migration's DDL — `ALTER TYPE ... ADD VALUE` in
 * particular. Locally `DIRECT_DATABASE_URL` is unset and `DATABASE_URL` already points
 * straight at Postgres, so this falls through to the same string either way.
 */
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
