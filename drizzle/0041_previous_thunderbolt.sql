CREATE TABLE "plaid_account_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"plaid_account_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"plaid_type" text DEFAULT '' NOT NULL,
	"plaid_subtype" text DEFAULT '' NOT NULL,
	"balance_cents" integer,
	"available_cents" integer,
	"balance_as_of" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"access_token" text NOT NULL,
	"institution_id" text DEFAULT '' NOT NULL,
	"institution_name" text DEFAULT '' NOT NULL,
	"sync_cursor" text,
	"last_synced_at" timestamp with time zone,
	"reauth_required_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plaid_account_links" ADD CONSTRAINT "plaid_account_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_account_links" ADD CONSTRAINT "plaid_account_links_item_id_plaid_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_account_links" ADD CONSTRAINT "plaid_account_links_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD CONSTRAINT "plaid_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_account_links_plaid_account_uq" ON "plaid_account_links" USING btree ("user_id","plaid_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_account_links_account_uq" ON "plaid_account_links" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX "plaid_account_links_item_idx" ON "plaid_account_links" USING btree ("user_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_items_user_item_uq" ON "plaid_items" USING btree ("user_id","item_id");