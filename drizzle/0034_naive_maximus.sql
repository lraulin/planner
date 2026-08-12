CREATE TABLE "finance_statement_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"balance_type" text NOT NULL,
	"apr_percent" numeric(6, 3) NOT NULL,
	"balance_subject" numeric(14, 2),
	"interest_charged" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"statement_date" date,
	"opening_balance" numeric(14, 2) NOT NULL,
	"closing_balance" numeric(14, 2) NOT NULL,
	"payment_due_date" date,
	"minimum_payment" numeric(14, 2),
	"past_due_amount" numeric(14, 2),
	"credit_limit" numeric(14, 2),
	"available_credit" numeric(14, 2),
	"payments_credits" numeric(14, 2),
	"purchases" numeric(14, 2),
	"cash_advances" numeric(14, 2),
	"balance_transfers" numeric(14, 2),
	"fees_charged" numeric(14, 2),
	"interest_charged" numeric(14, 2),
	"ytd_fees" numeric(14, 2),
	"ytd_interest" numeric(14, 2),
	"rewards_points" integer,
	"external_source" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_statement_rates" ADD CONSTRAINT "finance_statement_rates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_statement_rates" ADD CONSTRAINT "finance_statement_rates_statement_id_finance_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."finance_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_statements" ADD CONSTRAINT "finance_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_statements" ADD CONSTRAINT "finance_statements_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_statement_rates_statement_idx" ON "finance_statement_rates" USING btree ("user_id","statement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_statements_period_uq" ON "finance_statements" USING btree ("user_id","account_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_statements_external_ref_uq" ON "finance_statements" USING btree ("user_id","external_source","external_id") WHERE "finance_statements"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "finance_statements_account_end_idx" ON "finance_statements" USING btree ("user_id","account_id","period_end");