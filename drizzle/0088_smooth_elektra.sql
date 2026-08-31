ALTER TABLE "bank_account_links" RENAME COLUMN "scrape_balance_as_of" TO "provisional_balance_as_of";--> statement-breakpoint
ALTER TABLE "bank_account_links" ADD COLUMN "browser_pending_as_of" timestamp with time zone;--> statement-breakpoint
UPDATE "bank_account_links" AS "link"
SET "browser_pending_as_of" = (
	SELECT max("event"."occurred_at")
	FROM "finance_audit_events" AS "event"
	WHERE "event"."user_id" = "link"."user_id"
		AND "event"."kind" = 'bank_snapshot'
		AND "event"."scope"->'accountIds' ? "link"."account_id"::text
)
WHERE EXISTS (
	SELECT 1
	FROM "finance_audit_events" AS "event"
	WHERE "event"."user_id" = "link"."user_id"
		AND "event"."kind" = 'bank_snapshot'
		AND "event"."scope"->'accountIds' ? "link"."account_id"::text
);
