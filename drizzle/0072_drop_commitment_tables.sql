ALTER TABLE "finance_recurring_bills" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "finance_recurring_spend" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "finance_schedules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "finance_recurring_bills" CASCADE;--> statement-breakpoint
DROP TABLE "finance_recurring_spend" CASCADE;--> statement-breakpoint
DROP TABLE "finance_schedules" CASCADE;--> statement-breakpoint
ALTER TABLE "finance_payees" DROP CONSTRAINT "finance_payees_single_commitment";--> statement-breakpoint
-- The four foreign-key constraints drizzle-kit would drop here were already removed by
-- CASCADE when the three tables above were dropped (see the NOTICEs Postgres emits for
-- that DROP TABLE). Re-dropping them by name fails: Postgres truncates a long constraint
-- name to 63 bytes at creation, and the names drizzle-kit generated here are the
-- untruncated originals, which no longer match anything on disk.
DROP INDEX "finance_budget_categories_source_bill_uq";--> statement-breakpoint
DROP INDEX "finance_category_groups_commitment_key_uq";--> statement-breakpoint
DROP INDEX "finance_payees_commitment_bill_idx";--> statement-breakpoint
DROP INDEX "finance_payees_commitment_spend_idx";--> statement-breakpoint
DROP INDEX "finance_transactions_schedule_idx";--> statement-breakpoint
CREATE INDEX "finance_payees_budget_category_idx" ON "finance_payees" USING btree ("user_id","budget_category_id") WHERE "finance_payees"."budget_category_id" is not null;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" DROP COLUMN "source_bill_id";--> statement-breakpoint
ALTER TABLE "finance_category_groups" DROP COLUMN "source_commitment_key";--> statement-breakpoint
ALTER TABLE "finance_payees" DROP COLUMN "commitment_bill_id";--> statement-breakpoint
ALTER TABLE "finance_payees" DROP COLUMN "commitment_spend_id";--> statement-breakpoint
ALTER TABLE "finance_transactions" DROP COLUMN "schedule_id";