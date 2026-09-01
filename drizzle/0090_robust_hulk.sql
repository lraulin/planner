CREATE TABLE "finance_account_source_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source" text NOT NULL,
	"balance_cents" integer,
	"available_cents" integer,
	"as_of" timestamp with time zone,
	"as_of_day" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_account_links" ADD COLUMN "balance_source" text;--> statement-breakpoint
ALTER TABLE "finance_account_source_state" ADD CONSTRAINT "finance_account_source_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_account_source_state" ADD CONSTRAINT "finance_account_source_state_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_account_source_state_uq" ON "finance_account_source_state" USING btree ("user_id","account_id","source");--> statement-breakpoint
CREATE INDEX "finance_account_source_state_account_idx" ON "finance_account_source_state" USING btree ("user_id","account_id");--> statement-breakpoint
-- D5: backfill each source's stamp from the evidence the old columns hold, never from the
-- migration instant. `balance_as_of` was shared by all three sources, so it only proves the
-- feed's currency when no provisional write is outstanding.
INSERT INTO "finance_account_source_state" ("user_id", "account_id", "source", "balance_cents", "available_cents", "as_of")
SELECT "user_id", "account_id", 'feed', "balance_cents", "available_cents", "balance_as_of"
FROM "bank_account_links"
WHERE "provisional_balance_as_of" IS NULL AND "balance_as_of" IS NOT NULL;--> statement-breakpoint
-- A capture's own timestamp survived in `browser_pending_as_of`. It carries the balance only
-- when it is also the provisional write that set the headline.
INSERT INTO "finance_account_source_state" ("user_id", "account_id", "source", "balance_cents", "as_of")
SELECT "user_id", "account_id", 'browser',
       CASE WHEN "provisional_balance_as_of" = "browser_pending_as_of" THEN "balance_cents" END,
       "browser_pending_as_of"
FROM "bank_account_links"
WHERE "browser_pending_as_of" IS NOT NULL;--> statement-breakpoint
-- An outstanding provisional write that is not the capture's came from a file import.
INSERT INTO "finance_account_source_state" ("user_id", "account_id", "source", "balance_cents", "as_of")
SELECT "user_id", "account_id", 'file', "balance_cents", "provisional_balance_as_of"
FROM "bank_account_links"
WHERE "provisional_balance_as_of" IS NOT NULL
  AND ("browser_pending_as_of" IS NULL OR "browser_pending_as_of" <> "provisional_balance_as_of");--> statement-breakpoint
-- Where a provisional write was outstanding, the feed's own as-of was already lost: all three
-- sources shared one column. The feed row is left absent and the next sync writes it.
UPDATE "bank_account_links" SET "balance_source" = CASE
  WHEN "provisional_balance_as_of" IS NULL THEN 'feed'
  WHEN "provisional_balance_as_of" = "browser_pending_as_of" THEN 'browser'
  ELSE 'file' END
WHERE "balance_as_of" IS NOT NULL;
