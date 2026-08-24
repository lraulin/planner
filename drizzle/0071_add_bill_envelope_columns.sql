ALTER TABLE "finance_budget_categories" ADD COLUMN "kind" text DEFAULT 'envelope' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "cancelled_on" date;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "cadence_months" smallint;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "cadence_days" smallint;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "due_day" smallint;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "anchor_date" date;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "scheduled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "expected_cents" integer;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD COLUMN "budget_category_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD COLUMN "not_a_commitment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD CONSTRAINT "finance_payees_budget_category_id_finance_budget_categories_id_fk" FOREIGN KEY ("budget_category_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_kind" CHECK ("finance_budget_categories"."kind" in ('envelope', 'bill'));--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_status" CHECK ("finance_budget_categories"."status" in ('active', 'paused', 'cancelled'));--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_bill_facet" CHECK ((
        "finance_budget_categories"."kind" = 'bill' and "finance_budget_categories"."cadence_months" is not null
      ) or (
        "finance_budget_categories"."kind" = 'envelope'
        and "finance_budget_categories"."status" = 'active'
        and "finance_budget_categories"."cancelled_on" is null
        and "finance_budget_categories"."url" = ''
        and "finance_budget_categories"."cadence_months" is null
        and "finance_budget_categories"."cadence_days" is null
        and "finance_budget_categories"."due_day" is null
        and "finance_budget_categories"."anchor_date" is null
        and "finance_budget_categories"."scheduled" = true
        and "finance_budget_categories"."expected_cents" is null
      ));--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_cadence_months" CHECK ("finance_budget_categories"."cadence_months" is null or ("finance_budget_categories"."cadence_months" >= 1 and "finance_budget_categories"."cadence_months" <= 24));--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_cadence_days" CHECK ("finance_budget_categories"."cadence_days" is null or ("finance_budget_categories"."cadence_days" >= 2 and "finance_budget_categories"."cadence_days" <= 200));--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_due_day" CHECK ("finance_budget_categories"."due_day" is null or ("finance_budget_categories"."due_day" >= 1 and "finance_budget_categories"."due_day" <= 31));