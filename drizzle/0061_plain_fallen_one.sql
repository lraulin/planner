CREATE TABLE "finance_budget_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month" date NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"carryover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_budget_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_key" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_budget_months" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month" date NOT NULL,
	"buffered_cents" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_budget_months_buffered_nonneg" CHECK ("finance_budget_months"."buffered_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "finance_category_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_income" boolean DEFAULT false NOT NULL,
	"sort_key" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "off_budget" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "budget_category_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_budget_allocations" ADD CONSTRAINT "finance_budget_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_allocations" ADD CONSTRAINT "finance_budget_allocations_category_id_finance_budget_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_group_id_finance_category_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."finance_category_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_months" ADD CONSTRAINT "finance_budget_months_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_category_groups" ADD CONSTRAINT "finance_category_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_budget_allocations_user_month_category_uq" ON "finance_budget_allocations" USING btree ("user_id","month","category_id");--> statement-breakpoint
CREATE INDEX "finance_budget_allocations_user_month_idx" ON "finance_budget_allocations" USING btree ("user_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_budget_categories_user_group_name_uq" ON "finance_budget_categories" USING btree ("user_id","group_id","name");--> statement-breakpoint
CREATE INDEX "finance_budget_categories_user_sort_idx" ON "finance_budget_categories" USING btree ("user_id","group_id","sort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_budget_months_user_month_uq" ON "finance_budget_months" USING btree ("user_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_category_groups_user_name_uq" ON "finance_category_groups" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "finance_category_groups_user_sort_idx" ON "finance_category_groups" USING btree ("user_id","sort_key");--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_budget_category_id_finance_budget_categories_id_fk" FOREIGN KEY ("budget_category_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_transactions_budget_category_idx" ON "finance_transactions" USING btree ("user_id","budget_category_id","transaction_date") WHERE "finance_transactions"."budget_category_id" is not null;--> statement-breakpoint
-- Seed on-budget from account kind. `off_budget` defaults false, which would otherwise put
-- savings, investments and loans into the envelope budget on day one and make Ready to Assign
-- offer money the budget is not allowed to spend. On-budget is checking + cash (`SPENDABLE_KINDS`)
-- plus credit cards, which are a way of spending checking money rather than a second pool.
-- See agent-os/specs/2026-08-22-1948-zero-based-budget/ D3. A default this statement encodes
-- once; the column is the user's to change afterwards.
UPDATE "finance_accounts"
   SET "off_budget" = true
 WHERE "kind" NOT IN ('checking', 'cash', 'credit_card');
