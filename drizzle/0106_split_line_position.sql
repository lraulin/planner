ALTER TABLE "finance_transactions" ADD COLUMN "split_position" integer;--> statement-breakpoint
-- Existing lines keep the order they were last read in. Lines written together tie on
-- created_at, so among those the id decides, as the old query did.
UPDATE "finance_transactions" AS child
SET "split_position" = ranked.position
FROM (
  SELECT "id", (row_number() OVER (PARTITION BY "parent_id" ORDER BY "created_at", "id") - 1)::integer AS position
  FROM "finance_transactions"
  WHERE "parent_id" IS NOT NULL
) AS ranked
WHERE child."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_split_position_on_children" CHECK (("finance_transactions"."parent_id" is null) = ("finance_transactions"."split_position" is null));
