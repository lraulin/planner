-- Imported Achieve values at or beyond the end of the D band used to decode as D2500+
-- even though ranks only run from 1 through 2499. Clear both halves so an invalid rank
-- does not leave behind a misleading priority letter.
UPDATE "nodes"
SET "priority_letter" = NULL, "priority_rank" = NULL
WHERE "priority_rank" IS NOT NULL
  AND "priority_rank" NOT BETWEEN 1 AND 2499;

UPDATE "nodes"
SET "tc_priority_letter" = NULL, "tc_priority_rank" = NULL
WHERE "tc_priority_rank" IS NOT NULL
  AND "tc_priority_rank" NOT BETWEEN 1 AND 2499;

UPDATE "appointments"
SET "priority_letter" = NULL, "priority_rank" = NULL
WHERE "priority_rank" IS NOT NULL
  AND "priority_rank" NOT BETWEEN 1 AND 2499;

UPDATE "daily_items"
SET "priority_letter" = NULL, "priority_rank" = NULL
WHERE "priority_rank" IS NOT NULL
  AND "priority_rank" NOT BETWEEN 1 AND 2499;

UPDATE "metrics"
SET "priority_letter" = NULL, "priority_rank" = NULL
WHERE "priority_rank" IS NOT NULL
  AND "priority_rank" NOT BETWEEN 1 AND 2499;

UPDATE "node_items"
SET "priority_letter" = NULL, "priority_rank" = NULL
WHERE "priority_rank" IS NOT NULL
  AND "priority_rank" NOT BETWEEN 1 AND 2499;
