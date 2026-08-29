CREATE TABLE "finance_audit_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_identity" text NOT NULL,
	"before_fields" jsonb,
	"after_fields" jsonb
);
--> statement-breakpoint
CREATE TABLE "finance_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"origin" text NOT NULL,
	"batch_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"before_checkpoint" jsonb,
	"after_checkpoint" jsonb
);
--> statement-breakpoint
ALTER TABLE "finance_audit_changes" ADD CONSTRAINT "finance_audit_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_audit_changes" ADD CONSTRAINT "finance_audit_changes_event_id_finance_audit_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."finance_audit_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_audit_events" ADD CONSTRAINT "finance_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_audit_changes_event_sequence_uq" ON "finance_audit_changes" USING btree ("event_id","sequence");--> statement-breakpoint
CREATE INDEX "finance_audit_changes_user_event_idx" ON "finance_audit_changes" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "finance_audit_events_user_time_idx" ON "finance_audit_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "finance_audit_events_user_batch_idx" ON "finance_audit_events" USING btree ("user_id","batch_id");--> statement-breakpoint
INSERT INTO "finance_audit_events" (
	"user_id",
	"kind",
	"origin",
	"occurred_at",
	"summary",
	"scope",
	"source_evidence"
)
SELECT
	"user_id",
	'legacy_budget_movement',
	'Budget legacy movement log',
	"updated_at",
	'Legacy Budget movement log for ' || to_char("month", 'YYYY-MM'),
	jsonb_build_object('budgetMonths', jsonb_build_array(to_char("month", 'YYYY-MM-DD'))),
	jsonb_build_object('legacyNotes', "notes")
FROM "finance_budget_months"
WHERE btrim("notes") <> '';--> statement-breakpoint
ALTER TABLE "finance_budget_months" DROP COLUMN "notes";
