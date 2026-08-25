-- Core-kind rows must already be on-budget. Run
-- `npx tsx --env-file=.env.local scripts/single-pool-cutover.ts --user <id> --apply`
-- against this database first; the CHECK then refuses any leftover split.
ALTER TABLE "finance_transactions" DROP COLUMN "planned_withdrawal";--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_core_on_budget" CHECK ("finance_accounts"."kind"::text not in ('checking', 'savings', 'cash', 'credit_card')
          or "finance_accounts"."off_budget" = false);