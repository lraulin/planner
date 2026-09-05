CREATE TABLE "finance_reporting_archive" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"fields" jsonb NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_reporting_archive" ADD CONSTRAINT "finance_reporting_archive_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_reporting_archive_user_transaction_uq" ON "finance_reporting_archive" USING btree ("user_id","transaction_id");--> statement-breakpoint
-- Preserve the retired user metadata before removing its live writers and columns.
INSERT INTO "finance_reporting_archive" ("user_id", "transaction_id", "fields")
SELECT "user_id", "id", jsonb_build_object('excludeFromBaseline', "exclude_from_baseline", 'eventLabel', "event_label", 'notes', "notes")
FROM "finance_transactions" WHERE "exclude_from_baseline" OR btrim("event_label") <> ''
ON CONFLICT ("user_id", "transaction_id") DO NOTHING;--> statement-breakpoint
UPDATE "finance_transactions" SET "notes" = concat_ws(E'\n', nullif("notes", ''), 'Event: ' || btrim("event_label"))
WHERE btrim("event_label") <> '';--> statement-breakpoint
ALTER TABLE "finance_transactions" DROP COLUMN "exclude_from_baseline";--> statement-breakpoint
ALTER TABLE "finance_transactions" DROP COLUMN "event_label";