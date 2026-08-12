CREATE TYPE "public"."finance_account_kind" AS ENUM('checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'other');--> statement-breakpoint
CREATE TABLE "finance_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "finance_account_kind" DEFAULT 'other' NOT NULL,
	"institution" text DEFAULT '' NOT NULL,
	"external_source" text NOT NULL,
	"external_key" text NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"posted_date" date,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"source_category" text DEFAULT '' NOT NULL,
	"category" text,
	"notes" text DEFAULT '' NOT NULL,
	"balance_after" numeric(14, 2),
	"external_source" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_accounts_external_uq" ON "finance_accounts" USING btree ("user_id","external_source","external_key");--> statement-breakpoint
CREATE INDEX "finance_accounts_user_name_idx" ON "finance_accounts" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "finance_transactions_account_date_idx" ON "finance_transactions" USING btree ("user_id","account_id","transaction_date");--> statement-breakpoint
CREATE INDEX "finance_transactions_user_date_idx" ON "finance_transactions" USING btree ("user_id","transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_transactions_external_ref_uq" ON "finance_transactions" USING btree ("user_id","external_source","external_id") WHERE "finance_transactions"."external_id" is not null;