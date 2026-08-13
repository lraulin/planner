CREATE TYPE "public"."finance_flow_kind" AS ENUM('spend', 'income', 'internal_transfer', 'external_transfer', 'refund', 'interest_fee');--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "derived_category" text;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "derived_flow" "finance_flow_kind";--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "flow_override" "finance_flow_kind";--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "transfer_group_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "exclude_from_baseline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "event_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "finance_transactions_transfer_group_idx" ON "finance_transactions" USING btree ("user_id","transfer_group_id") WHERE "finance_transactions"."transfer_group_id" is not null;--> statement-breakpoint
CREATE INDEX "finance_transactions_flow_date_idx" ON "finance_transactions" USING btree ("user_id","derived_flow","transaction_date");