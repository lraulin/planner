-- Envelopes may sit in a section with no organisational group
-- (agent-os/specs/2026-08-24-0930-envelope-sections/ D2).
ALTER TABLE "finance_budget_categories" ALTER COLUMN "group_id" DROP NOT NULL;