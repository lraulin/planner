-- Hand-edited after `db:generate`: the generated SQL added the new columns and dropped the
-- old ones with nothing in between, which would have discarded every scheduling date in the
-- database. The backfill below is the whole point of the migration. The snapshot beside it is
-- the generated one and describes the same end state, so the chain stays intact.

ALTER TABLE "nodes" ADD COLUMN "target_start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "target_end_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "deferred_date" timestamp with time zone;--> statement-breakpoint

-- Carry the dates up. No node is ever both a task and a project, so the two updates cannot
-- touch the same row.
UPDATE "nodes" n SET
  "target_start_date" = td."target_start_date",
  "target_end_date" = td."target_end_date",
  "deferred_date" = td."deferred_date"
FROM "task_details" td
WHERE td."node_id" = n."id";--> statement-breakpoint

UPDATE "nodes" n SET
  "target_start_date" = pd."project_start",
  "target_end_date" = pd."target_end"
FROM "project_details" pd
WHERE pd."node_id" = n."id";--> statement-breakpoint

-- A deferred date now means the node is postponed until that date, so existing rows waiting
-- on one have to say so. Compared as UTC calendar days to match `isDeferred`, which treats a
-- node deferred to *today* as available rather than shelved.
UPDATE "nodes" SET "state" = 'postponed'
WHERE "deferred_date" IS NOT NULL
  AND ("deferred_date" AT TIME ZONE 'UTC')::date > (now() AT TIME ZONE 'UTC')::date
  AND "state" NOT IN ('completed', 'cancelled');--> statement-breakpoint

-- Nothing enforced "a plan may not precede availability" until now, so a row could already
-- violate it and would fail the constraint below. Clear the plan rather than pushing it: a
-- task planned for Tuesday and shelved past it was never planned for the later date.
--
-- The day lines are deleted in the same statement, scoped to exactly the rows just cleared.
-- A blanket "delete open lines for nodes with no target start" would take out planned
-- *projects*, which legitimately hold a day line with no target start of their own.
WITH cleared AS (
  UPDATE "nodes" SET "target_start_date" = NULL
  WHERE "deferred_date" IS NOT NULL
    AND "target_start_date" IS NOT NULL
    AND "target_start_date" < "deferred_date"
  RETURNING "id"
)
DELETE FROM "daily_items"
WHERE "node_id" IN (SELECT "id" FROM cleared)
  AND "completed_at" IS NULL
  AND "forwarded_to" IS NULL;--> statement-breakpoint

-- Only now that no row violates it.
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_start_not_before_deferred" CHECK ("nodes"."target_start_date" is null or "nodes"."deferred_date" is null or "nodes"."target_start_date" >= "nodes"."deferred_date");--> statement-breakpoint

ALTER TABLE "project_details" DROP COLUMN "project_start";--> statement-breakpoint
ALTER TABLE "project_details" DROP COLUMN "target_end";--> statement-breakpoint
ALTER TABLE "task_details" DROP COLUMN "target_start_date";--> statement-breakpoint
ALTER TABLE "task_details" DROP COLUMN "target_end_date";--> statement-breakpoint
ALTER TABLE "task_details" DROP COLUMN "deferred_date";
