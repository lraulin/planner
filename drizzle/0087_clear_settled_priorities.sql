-- Completed and cancelled nodes used to keep outline and TC ranks, so leftover A1s punched
-- holes in the remaining work. Completing now drops a node out of the ranking; this
-- one-time repair clears already-settled rows and densifies what is left.
-- See agent-os/specs/2026-08-30-1001-clear-priority-on-settle.
--
-- Recurring tasks that are Not Started or Deferred are left alone — they are still in the
-- ranking. Only currently completed/cancelled rows are settled.

UPDATE "nodes"
SET
  "priority_letter" = NULL,
  "priority_rank" = NULL,
  "tc_priority_letter" = NULL,
  "tc_priority_rank" = NULL
WHERE "state" IN ('completed', 'cancelled')
  AND (
    "priority_letter" IS NOT NULL
    OR "tc_priority_letter" IS NOT NULL
  );--> statement-breakpoint

-- Densify remaining outline groups: 1..n per (user, parent, letter).
-- Existing ranks win, sort_key breaks ties. PARTITION BY treats NULL parent_id as one
-- group, which is what root-level nodes need.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "user_id", "parent_id", "priority_letter"
      ORDER BY "priority_rank" ASC NULLS LAST, "sort_key" ASC
    ) AS rn
  FROM "nodes"
  WHERE "priority_letter" IS NOT NULL
)
UPDATE "nodes"
SET "priority_rank" = ranked.rn
FROM ranked
WHERE "nodes"."id" = ranked."id"
  AND "nodes"."priority_rank" IS DISTINCT FROM ranked.rn;--> statement-breakpoint

-- Densify remaining TC groups: 1..n per (user, letter).
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "user_id", "tc_priority_letter"
      ORDER BY "tc_priority_rank" ASC NULLS LAST, "sort_key" ASC
    ) AS rn
  FROM "nodes"
  WHERE "tc_priority_letter" IS NOT NULL
)
UPDATE "nodes"
SET "tc_priority_rank" = ranked.rn
FROM ranked
WHERE "nodes"."id" = ranked."id"
  AND "nodes"."tc_priority_rank" IS DISTINCT FROM ranked.rn;
