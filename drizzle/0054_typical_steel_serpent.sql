-- Backfill before the constraint: a node's priority is now blank or a letter *with* a rank,
-- and the real database holds 27 bare letters and several ties. See
-- agent-os/specs/2026-08-19-0912-always-ranked-priorities.

-- A rank with no letter never meant anything and the write paths already cleared it; this
-- catches anything older that slipped in.
UPDATE "nodes" SET "priority_rank" = NULL WHERE "priority_letter" IS NULL;--> statement-breakpoint

-- Densify each (user, parent, letter) group to 1..n.
--
-- Existing ranks win, so a hand-ranked group keeps the order its owner gave it. Bare letters
-- sort last, which is where they already displayed (`lib/priority/order`), so they land after
-- the rows that were numbered rather than jumping ahead of them. `sort_key` breaks every
-- remaining tie, which makes the result outline order — the default the whole model rests on.
--
-- PARTITION BY treats NULL parent_id values as one group, which is what root-level nodes need.
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

ALTER TABLE "nodes" ADD CONSTRAINT "nodes_priority_letter_ranked" CHECK (("nodes"."priority_letter" is null) = ("nodes"."priority_rank" is null));
