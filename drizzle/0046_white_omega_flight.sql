CREATE TABLE "finance_recurring_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"matchers" text[] DEFAULT '{}' NOT NULL,
	"period" text DEFAULT 'week' NOT NULL,
	"amount_source" text DEFAULT 'auto' NOT NULL,
	"expected_cents" integer,
	"set_aside" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_recurring_spend_period" CHECK ("finance_recurring_spend"."period" in ('week', 'month')),
	CONSTRAINT "finance_recurring_spend_amount_source" CHECK ("finance_recurring_spend"."amount_source" in ('auto', 'pinned')),
	CONSTRAINT "finance_recurring_spend_expected_cents" CHECK ("finance_recurring_spend"."expected_cents" is null or "finance_recurring_spend"."expected_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD COLUMN "matchers" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD COLUMN "cancelled_on" date;--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD COLUMN "cancel_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_recurring_spend" ADD CONSTRAINT "finance_recurring_spend_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_recurring_spend_name_uq" ON "finance_recurring_spend" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD CONSTRAINT "finance_recurring_bills_status" CHECK ("finance_recurring_bills"."status" in ('active', 'cancelled', 'ignored'));--> statement-breakpoint
-- Backfill, hand-written: `merchant` was doing three jobs (display name, unique key, and the
-- join to finance_transactions) and is being split into `name` + `matchers`. Every existing
-- declaration starts as its own single-merchant commitment, which preserves current behaviour
-- exactly; regrouping (Pizza Hut + Domino's) is a later user action, not a migration guess.
-- `name` is set NOT NULL and `merchant` dropped in the next migration, after this runs —
-- add, backfill, then drop, never drop first (agent-os/standards/database/migrations.md).
UPDATE "finance_recurring_bills" SET "name" = "merchant" WHERE "name" IS NULL;--> statement-breakpoint
UPDATE "finance_recurring_bills" SET "matchers" = ARRAY["merchant"] WHERE cardinality("matchers") = 0;