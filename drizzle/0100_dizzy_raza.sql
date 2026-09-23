CREATE TABLE "finance_capture_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"from_day" date NOT NULL,
	"through_day" date NOT NULL,
	"audit_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_capture_coverage_ordered" CHECK ("finance_capture_coverage"."from_day" <= "finance_capture_coverage"."through_day")
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "history_source" text DEFAULT 'files' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "history_source_since" date;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "balance_cents" integer;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "available_cents" integer;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "balance_as_of" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "balance_source" text;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "bank_display_name" text;--> statement-breakpoint
ALTER TABLE "finance_capture_coverage" ADD CONSTRAINT "finance_capture_coverage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_capture_coverage" ADD CONSTRAINT "finance_capture_coverage_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_capture_coverage" ADD CONSTRAINT "finance_capture_coverage_audit_event_id_finance_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."finance_audit_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_capture_coverage_range_uq" ON "finance_capture_coverage" USING btree ("user_id","account_id","from_day","through_day");--> statement-breakpoint
CREATE INDEX "finance_capture_coverage_account_idx" ON "finance_capture_coverage" USING btree ("user_id","account_id");--> statement-breakpoint
UPDATE "finance_accounts" SET "balance_cents" = l."balance_cents", "available_cents" = l."available_cents", "balance_as_of" = l."balance_as_of", "balance_source" = l."balance_source" FROM "bank_account_links" l WHERE l."account_id" = "finance_accounts"."id" AND l."user_id" = "finance_accounts"."user_id";--> statement-breakpoint
UPDATE "finance_accounts" SET "history_source" = 'simplefin' WHERE EXISTS (SELECT 1 FROM "bank_account_links" l WHERE l."account_id" = "finance_accounts"."id" AND l."user_id" = "finance_accounts"."user_id");--> statement-breakpoint
ALTER TABLE "bank_account_links" DROP COLUMN "balance_cents";--> statement-breakpoint
ALTER TABLE "bank_account_links" DROP COLUMN "available_cents";--> statement-breakpoint
ALTER TABLE "bank_account_links" DROP COLUMN "balance_as_of";--> statement-breakpoint
ALTER TABLE "bank_account_links" DROP COLUMN "balance_source";--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_history_source_valid" CHECK ("finance_accounts"."history_source" in ('simplefin', 'bank_page', 'files'));