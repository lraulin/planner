ALTER TABLE "finance_budget_categories" ADD COLUMN "income_role" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "expected_monthly_income_cents" integer;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_income_role" CHECK ("finance_budget_categories"."income_role" in ('regular', 'other'));--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_income_facet" CHECK (("finance_budget_categories"."kind" = 'income' or ("finance_budget_categories"."income_role" = 'other' and "finance_budget_categories"."expected_monthly_income_cents" is null)) and ("finance_budget_categories"."expected_monthly_income_cents" is null or "finance_budget_categories"."expected_monthly_income_cents" >= 0));
--> statement-breakpoint
-- Verified from production on 2026-09-05; estimates deliberately remain unset.
UPDATE "finance_budget_categories" SET "income_role" = 'regular'
WHERE "user_id" = 'de3a32c2-c456-4456-a5c2-a08de891d98e'
AND "kind" = 'income'
AND "id" IN ('a03e30ac-b3e0-4d53-9106-2a501c37b351', 'f57abb97-4750-4fa1-8c9f-ad6930b487eb');
