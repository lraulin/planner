ALTER TABLE "finance_budget_categories" DROP CONSTRAINT "finance_budget_categories_bill_facet";--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "lead_days" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_lead_days" CHECK ("finance_budget_categories"."lead_days" >= 0 and "finance_budget_categories"."lead_days" <= 60);--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_bill_facet" CHECK ((
        "finance_budget_categories"."kind" = 'bill' and "finance_budget_categories"."cadence_months" is not null
      ) or (
        "finance_budget_categories"."kind" <> 'bill'
        and "finance_budget_categories"."status" = 'active'
        and "finance_budget_categories"."cancelled_on" is null
        and "finance_budget_categories"."url" = ''
        and "finance_budget_categories"."cadence_months" is null
        and "finance_budget_categories"."cadence_days" is null
        and "finance_budget_categories"."due_day" is null
        and "finance_budget_categories"."lead_days" = 0
        and "finance_budget_categories"."anchor_date" is null
        and "finance_budget_categories"."scheduled" = true
        and "finance_budget_categories"."expected_cents" is null
      ));