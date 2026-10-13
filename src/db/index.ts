import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { createPool } from "./pool";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  }
  return url;
}

// Next.js discards module state on hot reload, which would leak a connection pool per
// edit. Cache the pool on globalThis so development reuses one.
const globalForDb = globalThis as unknown as { pgPool?: pg.Pool };

function sharedPool(): pg.Pool {
  if (globalForDb.pgPool) return globalForDb.pgPool;

  const pool = createPool({ connectionString: connectionString() });
  // Keeps a Vercel function instance alive until the pool's idle clients have closed, so
  // none are left open across a suspension. Returns immediately anywhere else.
  attachDatabasePool(pool);
  if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;
  return pool;
}

export const db = drizzle(sharedPool(), { schema });
export { schema };
