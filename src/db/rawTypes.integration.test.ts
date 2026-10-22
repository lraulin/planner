import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { transactionIngestionWatermark } from "@/lib/finances/ingestion";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";

/**
 * The JavaScript type each kind of raw selection arrives as, through the app's own `db`.
 *
 * Drizzle parses a typed *column*; a raw `db.execute` is parsed by the driver alone, and the
 * readers that use one (`loadOutline`, `loadNodeChain`, the note loaders, the ingestion
 * watermark) cast its rows with `as`. Typecheck therefore cannot see a change here: a
 * boolean arriving as `"f"` would make `Boolean(r.focus)` true for every row, and a `text[]`
 * arriving as `"{a,b}"` would turn contexts into characters. The driver changed once under
 * these readers already (postgres.js to node-postgres), and these were measured identical.
 *
 * No user-owned rows: every value is a literal, so there is nothing for a second user to try.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("raw selection types");

describeDb("raw selection types through db.execute", () => {
  it("pins each kind the raw readers rely on", async () => {
    const result = await db.execute(sql`
      select
        ${"00000000-0000-0000-0000-000000000001"}::uuid as uuid,
        'x'::text as text,
        'task'::node_type as enum,
        null::text as missing,
        true as yes,
        false as no,
        2::int2 as int2,
        1::int4 as int4,
        0 as literal_int,
        count(*)::int as count_int,
        count(*) as count,
        3::int8 as int8,
        1.50::numeric as numeric,
        '2026-10-11'::date as date,
        '2026-10-12T03:30:00Z'::timestamptz as timestamptz,
        array['a', 'b']::text[] as text_array,
        array[]::text[] as empty_text_array,
        array['a', null]::text[] as text_array_with_null,
        array['task']::node_type[] as enum_array,
        '{"a": 1}'::jsonb as jsonb
    `);
    const row = result.rows[0];

    // Ids, names and enum values are cast straight to their TypeScript types.
    expect(row.uuid).toBe("00000000-0000-0000-0000-000000000001");
    expect(row.text).toBe("x");
    expect(row.enum).toBe("task");
    // `?? null` and `=== null` both read a SQL NULL as JS `null`, never `undefined`.
    expect(row.missing).toBeNull();
    // `Boolean(r.collapsed)`: a string "f" would read as true.
    expect(row.yes).toBe(true);
    expect(row.no).toBe(false);
    // `Number(r.depth)`, priority ranks, `count(*)::int` as child_count.
    expect(row.int2).toBe(2);
    expect(row.int4).toBe(1);
    expect(row.literal_int).toBe(0);
    expect(row.count_int).toBe(1);
    // 64-bit and arbitrary precision stay strings; every reader wraps them in `Number()`.
    expect(row.count).toBe("1");
    expect(row.int8).toBe("3");
    expect(row.numeric).toBe("1.50");
    // Dates and instants arrive as text, and the readers build the `Date` themselves.
    expect(row.date).toBe("2026-10-11");
    expect(typeof row.timestamptz).toBe("string");
    expect(new Date(row.timestamptz as string).toISOString()).toBe(
      "2026-10-12T03:30:00.000Z",
    );
    // `(r.contexts as string[] | null) ?? []`.
    expect(row.text_array).toEqual(["a", "b"]);
    expect(row.empty_text_array).toEqual([]);
    // postgres.js returned the string "NULL" here; nothing stores a NULL context today.
    expect(row.text_array_with_null).toEqual(["a", null]);
    // Not parsed: an enum array in raw SQL is its literal. No raw reader selects one; cast
    // it to `text[]` in the query if one ever does.
    expect(row.enum_array).toBe("{task}");
    expect(row.jsonb).toEqual({ a: 1 });
  });

  it("reads the ingestion watermark as the database's current instant", async () => {
    const before = Date.now();
    const watermark = await transactionIngestionWatermark();
    const after = Date.now();

    expect(watermark).toBeInstanceOf(Date);
    // Database clock against this process's; the same machine locally, so a second covers it.
    expect(watermark.getTime()).toBeGreaterThan(before - 1_000);
    expect(watermark.getTime()).toBeLessThan(after + 1_000);
  });
});
