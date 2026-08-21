ALTER TABLE "finance_recurring_bills" ADD COLUMN "cadence_days" smallint;--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_recurring_spend" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD CONSTRAINT "finance_recurring_bills_cadence_days" CHECK ("finance_recurring_bills"."cadence_days" is null or ("finance_recurring_bills"."cadence_days" >= 2 and "finance_recurring_bills"."cadence_days" <= 200));