ALTER TABLE "finance_budget_allocations" ADD COLUMN "goal_cents" integer;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "templates" jsonb DEFAULT '[]'::jsonb NOT NULL;