CREATE TABLE "bank_account_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_account_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"institution" text DEFAULT '' NOT NULL,
	"balance_cents" integer,
	"available_cents" integer,
	"balance_as_of" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_url" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"synced_through" date,
	"last_synced_at" timestamp with time zone,
	"reauth_required_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_account_links" ADD CONSTRAINT "bank_account_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account_links" ADD CONSTRAINT "bank_account_links_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account_links" ADD CONSTRAINT "bank_account_links_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_links_external_uq" ON "bank_account_links" USING btree ("user_id","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_links_account_uq" ON "bank_account_links" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX "bank_account_links_connection_idx" ON "bank_account_links" USING btree ("user_id","connection_id");--> statement-breakpoint
CREATE INDEX "bank_connections_user_idx" ON "bank_connections" USING btree ("user_id");