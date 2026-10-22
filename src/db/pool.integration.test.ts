import net from "node:net";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  isInternalError,
  safeErrorMessage,
  GENERIC_ERROR_MESSAGE,
} from "@/lib/security/safeError";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createPool, DatabaseConnectionError } from "./pool";

/**
 * What `src/db/pool.ts` promises that nothing else would notice losing: a transaction runs
 * one statement at a time however its callers fan out, and a connection that cannot be had
 * is recognisable as the database's rather than a sentence someone wrote.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("connection pool");

const pools: pg.Pool[] = [];
const servers: net.Server[] = [];
const sockets: net.Socket[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  restoreQuery?.();
  restoreQuery = null;
});

afterAll(async () => {
  // A silent server holds its sockets open, and `close()` waits for them.
  for (const socket of sockets) socket.destroy();
  await Promise.all(pools.map((pool) => pool.end()));
  await Promise.all(
    servers.map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
});

function localDb() {
  const pool = createPool({ connectionString: process.env.DATABASE_URL, max: 2 });
  pools.push(pool);
  return drizzle(pool);
}

type Query = (...args: unknown[]) => Promise<unknown>;
let restoreQuery: (() => void) | null = null;

/** Wrap the driver and report the most statements it ever had running on one client. */
function trackConcurrency() {
  const client = pg.Client.prototype as unknown as { query: Query };
  const original = client.query;
  const running = new Map<object, number>();
  let widest = 0;

  client.query = function (this: object, ...args: unknown[]) {
    const now = (running.get(this) ?? 0) + 1;
    running.set(this, now);
    widest = Math.max(widest, now);
    const done = () => running.set(this, (running.get(this) ?? 1) - 1);
    return original.apply(this, args).then(
      (value) => {
        done();
        return value;
      },
      (error: unknown) => {
        done();
        throw error;
      },
    );
  };
  restoreQuery = () => {
    client.query = original;
  };
  return { widest: () => widest };
}

describeDb("a transaction's client", () => {
  it("runs the statements of a Promise.all one at a time, in the order issued", async () => {
    const db = localDb();
    const seen = trackConcurrency();

    const numbers = await db.transaction(async (tx) => {
      await tx.execute(sql`create temp sequence pool_order_seq`);
      const results = await Promise.all(
        [1, 2, 3, 4, 5].map(() =>
          tx.execute<{ n: string }>(sql`select nextval('pool_order_seq') as n`),
        ),
      );
      return results.map((result) => Number(result.rows[0].n));
    });

    expect(numbers).toEqual([1, 2, 3, 4, 5]);
    // Five statements were handed to the client at once; it was only ever given one.
    expect(seen.widest()).toBe(1);
  });

  it("does not let a failed statement wedge the ones queued behind it", async () => {
    const db = localDb();

    const outcomes = await db.transaction(async (tx) => {
      return Promise.allSettled([
        tx.execute(sql`select 1 as ok`),
        tx.execute(sql`select 1 / ${0}::int as boom`),
        tx.execute(sql`select 2 as after_the_failure`),
      ]);
    });

    // The third is refused by an aborted transaction, which is an answer. A queue that
    // stopped at the failure would have left it pending and this test timing out.
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
      "rejected",
    ]);
  });
});

describe("a database that cannot be reached", () => {
  /** Accepts the connection and then says nothing: the shape of a stalled network. */
  async function silentServer(): Promise<number> {
    const server = net.createServer((socket) => {
      sockets.push(socket);
    });
    servers.push(server);
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
    return (server.address() as net.AddressInfo).port;
  }

  async function deadDb() {
    const port = await silentServer();
    const pool = createPool({
      connectionString: `postgresql://nobody:hunter2@127.0.0.1:${port}/secretdb`,
      connectionTimeoutMillis: 200,
    });
    pools.push(pool);
    return drizzle(pool);
  }

  it("fails a transaction's connect with an error the redaction recognises", async () => {
    const db = await deadDb();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const error = await db
      .transaction(() => Promise.resolve("unreachable"))
      .catch((e: unknown) => e);

    // The driver's own error has no `code` at any depth and is not a Drizzle wrapper, so
    // nothing else would have called it internal.
    expect(error).toBeInstanceOf(DatabaseConnectionError);
    expect(((error as Error).cause as Error).message).toMatch(/timeout/i);
    expect(isInternalError(error)).toBe(true);
    expect(safeErrorMessage(error, "test")).toBe(GENERIC_ERROR_MESSAGE);
    expect(log).toHaveBeenCalledWith("[test]", error);
  });

  it("fails a plain query through the same redaction", async () => {
    const db = await deadDb();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const error = await db
      .execute(sql`select ${"a bank description"} as x`)
      .catch((e: unknown) => e);

    expect(isInternalError(error)).toBe(true);
    // The statement and its parameters are in the thrown message; they are not allowed out.
    expect((error as Error).message).toContain("a bank description");
    expect(safeErrorMessage(error, "test")).toBe(GENERIC_ERROR_MESSAGE);
    expect(log).toHaveBeenCalledWith("[test]", error);
  });
});

/** True when nothing in the first few links of the chain carries a `code`. */
function codeless(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    if ("code" in current) return false;
    current = current.cause;
  }
  return true;
}

describeDb("a connection that drops mid-statement", () => {
  /**
   * A TCP relay to the real database that can be cut. Destroying both halves is what a
   * pooler restart or a NAT timeout looks like from the client: the socket closes with no
   * Postgres error message, so pg reports "Connection terminated unexpectedly" and no `code`.
   */
  async function severableDb() {
    const target = new URL(process.env.DATABASE_URL ?? "");
    const live: net.Socket[] = [];
    const server = net.createServer((inbound) => {
      const outbound = net.connect(Number(target.port || 5432), target.hostname);
      for (const socket of [inbound, outbound]) {
        socket.on("error", () => {});
        live.push(socket);
        sockets.push(socket);
      }
      inbound.pipe(outbound).pipe(inbound);
    });
    servers.push(server);
    await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));

    const relayed = new URL(target);
    relayed.hostname = "127.0.0.1";
    relayed.port = String((server.address() as net.AddressInfo).port);
    const pool = createPool({ connectionString: relayed.toString(), max: 2 });
    pools.push(pool);
    return {
      db: drizzle(pool),
      sever: () => {
        for (const socket of live.splice(0)) socket.destroy();
      },
    };
  }

  it("redacts a query whose connection is cut while it runs", async () => {
    const { db, sever } = await severableDb();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // Warm the pool so the cut lands on a running statement, not on the connect.
    await db.execute(sql`select 1`);

    const pending = db
      .execute(sql`select pg_sleep(5), ${"a bank description"} as x`)
      .catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 100));
    sever();
    const error = await pending;

    // The shape that made `code` alone an unsafe tell.
    expect(codeless(error)).toBe(true);
    expect(isInternalError(error)).toBe(true);
    expect(safeErrorMessage(error, "test")).toBe(GENERIC_ERROR_MESSAGE);
    expect(log).toHaveBeenCalledWith("[test]", error);
  });

  it("redacts a transaction whose connection is cut between statements", async () => {
    const { db, sever } = await severableDb();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const error = await db
      .transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        sever();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await tx.execute(sql`select ${"a bank description"} as x`);
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(codeless(error)).toBe(true);
    expect(isInternalError(error)).toBe(true);
    expect(safeErrorMessage(error, "test")).toBe(GENERIC_ERROR_MESSAGE);
    expect(log).toHaveBeenCalledWith("[test]", error);
    // The drop itself arrived while the client was checked out and idle. Unheard, it is an
    // uncaught exception, which Vitest reports as a failed run.
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("checked-out client dropped"),
    );
  });
});

describeDb("a pooled client checked out again and again", () => {
  it("carries the same error listeners after a dozen transactions as after one", async () => {
    const pool = createPool({ connectionString: process.env.DATABASE_URL, max: 1 });
    pools.push(pool);
    const db = drizzle(pool);

    const listenersWhileCheckedOut = async () => {
      const client = await pool.connect();
      const count = client.listenerCount("error");
      client.release();
      return count;
    };

    const first = await listenersWhileCheckedOut();
    for (let i = 0; i < 12; i++)
      await db.transaction((tx) => tx.execute(sql`select 1`));
    expect(await listenersWhileCheckedOut()).toBe(first);
  });
});
