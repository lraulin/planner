-- Sections move onto the envelope (agent-os/specs/2026-08-24-0930-envelope-sections/).
--
-- The generated diff is correct about structure and silent about data, so the two backfill
-- statements below are hand-added. Order is load-bearing twice over: both CHECKs come off
-- before any value is rewritten, and `is_income` is read before the column is dropped.

ALTER TABLE "finance_budget_categories" DROP CONSTRAINT "finance_budget_categories_kind";--> statement-breakpoint
ALTER TABLE "finance_budget_categories" DROP CONSTRAINT "finance_budget_categories_bill_facet";--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ALTER COLUMN "kind" SET DEFAULT 'spending';--> statement-breakpoint
-- Every non-bill row becomes 'spending' first, so the only rows left to reclassify are the
-- ones the retiring group flag actually marks.
UPDATE "finance_budget_categories" SET "kind" = 'spending' WHERE "kind" = 'envelope';--> statement-breakpoint
UPDATE "finance_budget_categories" AS c
   SET "kind" = 'income'
  FROM "finance_category_groups" AS g
 WHERE g."id" = c."group_id"
   AND g."is_income"
   AND c."kind" <> 'bill';--> statement-breakpoint
ALTER TABLE "finance_category_groups" DROP COLUMN "is_income";--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_kind" CHECK ("finance_budget_categories"."kind" in ('income', 'spending', 'bill', 'savings'));--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_bill_facet" CHECK ((
        "finance_budget_categories"."kind" = 'bill' and "finance_budget_categories"."cadence_months" is not null
      ) or (
        "finance_budget_categories"."kind" <> 'bill'
        and "finance_budget_categories"."status" = 'active'
        and "finance_budget_categories"."cancelled_on" is null
        and "finance_budget_categories"."url" = ''
        and "finance_budget_categories"."cadence_months" is null
        and "finance_budget_categories"."cadence_days" is null
        and "finance_budget_categories"."due_day" is null
        and "finance_budget_categories"."anchor_date" is null
        and "finance_budget_categories"."scheduled" = true
        and "finance_budget_categories"."expected_cents" is null
      ));