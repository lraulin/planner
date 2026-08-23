ALTER TABLE "finance_budget_categories" DROP CONSTRAINT "finance_budget_categories_group_id_finance_category_groups_id_fk";
--> statement-breakpoint
DROP INDEX "finance_category_groups_user_name_uq";--> statement-breakpoint
DROP INDEX "finance_category_groups_user_sort_idx";--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD COLUMN "source_bill_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_category_groups" ADD COLUMN "parent_group_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_category_groups" ADD COLUMN "source_commitment_key" text;--> statement-breakpoint
ALTER TABLE "finance_schedules" ADD COLUMN "budget_category_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_source_bill_id_finance_recurring_bills_id_fk" FOREIGN KEY ("source_bill_id") REFERENCES "public"."finance_recurring_bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" ADD CONSTRAINT "finance_budget_categories_group_id_finance_category_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."finance_category_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_category_groups" ADD CONSTRAINT "finance_category_groups_parent_group_id_finance_category_groups_id_fk" FOREIGN KEY ("parent_group_id") REFERENCES "public"."finance_category_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_schedules" ADD CONSTRAINT "finance_schedules_budget_category_id_finance_budget_categories_id_fk" FOREIGN KEY ("budget_category_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_budget_categories_source_bill_uq" ON "finance_budget_categories" USING btree ("user_id","source_bill_id") WHERE "finance_budget_categories"."source_bill_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_category_groups_root_name_uq" ON "finance_category_groups" USING btree ("user_id","name") WHERE "finance_category_groups"."parent_group_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_category_groups_child_name_uq" ON "finance_category_groups" USING btree ("user_id","parent_group_id","name") WHERE "finance_category_groups"."parent_group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_category_groups_commitment_key_uq" ON "finance_category_groups" USING btree ("user_id","source_commitment_key") WHERE "finance_category_groups"."source_commitment_key" is not null;--> statement-breakpoint
CREATE INDEX "finance_category_groups_user_parent_sort_idx" ON "finance_category_groups" USING btree ("user_id","parent_group_id","sort_key");--> statement-breakpoint
CREATE INDEX "finance_schedules_budget_category_idx" ON "finance_schedules" USING btree ("user_id","budget_category_id") WHERE "finance_schedules"."budget_category_id" is not null;
--> statement-breakpoint
WITH ordered AS (
  SELECT
    "id",
    lpad(row_number() OVER (
      PARTITION BY "user_id", "parent_group_id"
      ORDER BY "sort_key", "id"
    )::text, 12, '0') || 'V' AS "new_sort_key"
  FROM "finance_category_groups"
)
UPDATE "finance_category_groups" AS target
SET "sort_key" = ordered."new_sort_key"
FROM ordered
WHERE target."id" = ordered."id";
--> statement-breakpoint
WITH ordered AS (
  SELECT
    "id",
    lpad(row_number() OVER (
      PARTITION BY "user_id", "group_id"
      ORDER BY "sort_key", "id"
    )::text, 12, '0') || 'V' AS "new_sort_key"
  FROM "finance_budget_categories"
)
UPDATE "finance_budget_categories" AS target
SET "sort_key" = ordered."new_sort_key"
FROM ordered
WHERE target."id" = ordered."id";
--> statement-breakpoint
UPDATE "finance_recurring_bills"
SET "category" = CASE
  WHEN upper("name") ~ '(OPENAI|ANTHROPIC|CLAUDE|GROK|XAI)' THEN 'AI'
  WHEN upper("name") ~ '(DROPBOX|1PASSWORD|SANEBOX|GOOGLE (ONE|STORAGE))' THEN 'Productivity & Security'
  ELSE 'Software & Development'
END
WHERE "category" = 'Software & AI';
--> statement-breakpoint
UPDATE "finance_recurring_spend"
SET "category" = CASE
  WHEN upper("name") ~ '(OPENAI|ANTHROPIC|CLAUDE|GROK|XAI)' THEN 'AI'
  WHEN upper("name") ~ '(DROPBOX|1PASSWORD|SANEBOX|GOOGLE (ONE|STORAGE))' THEN 'Productivity & Security'
  ELSE 'Software & Development'
END
WHERE "category" = 'Software & AI';
--> statement-breakpoint
UPDATE "finance_transactions" AS transaction
SET "category" = CASE
  WHEN upper(coalesce(payee."name", transaction."description")) ~ '(OPENAI|ANTHROPIC|CLAUDE|GROK|XAI)' THEN 'AI'
  WHEN upper(coalesce(payee."name", transaction."description")) ~ '(DROPBOX|1PASSWORD|SANEBOX|GOOGLE (ONE|STORAGE))' THEN 'Productivity & Security'
  ELSE 'Software & Development'
END
FROM "finance_payees" AS payee
WHERE transaction."payee_id" = payee."id"
  AND transaction."category" = 'Software & AI';
--> statement-breakpoint
UPDATE "finance_transactions"
SET "category" = CASE
  WHEN upper("description") ~ '(OPENAI|ANTHROPIC|CLAUDE|GROK|XAI)' THEN 'AI'
  WHEN upper("description") ~ '(DROPBOX|1PASSWORD|SANEBOX|GOOGLE (ONE|STORAGE))' THEN 'Productivity & Security'
  ELSE 'Software & Development'
END
WHERE "category" = 'Software & AI';
--> statement-breakpoint
UPDATE "finance_transactions" AS transaction
SET "derived_category" = CASE
  WHEN upper(coalesce(payee."name", transaction."description")) ~ '(OPENAI|ANTHROPIC|CLAUDE|GROK|XAI)' THEN 'AI'
  WHEN upper(coalesce(payee."name", transaction."description")) ~ '(DROPBOX|1PASSWORD|SANEBOX|GOOGLE (ONE|STORAGE))' THEN 'Productivity & Security'
  ELSE 'Software & Development'
END
FROM "finance_payees" AS payee
WHERE transaction."payee_id" = payee."id"
  AND transaction."derived_category" = 'Software & AI';
--> statement-breakpoint
UPDATE "finance_transactions"
SET "derived_category" = CASE
  WHEN upper("description") ~ '(OPENAI|ANTHROPIC|CLAUDE|GROK|XAI)' THEN 'AI'
  WHEN upper("description") ~ '(DROPBOX|1PASSWORD|SANEBOX|GOOGLE (ONE|STORAGE))' THEN 'Productivity & Security'
  ELSE 'Software & Development'
END
WHERE "derived_category" = 'Software & AI';
--> statement-breakpoint
UPDATE "finance_budget_categories"
SET "source_categories" = array_cat(
  array_remove("source_categories", 'Software & AI'),
  ARRAY['AI', 'Productivity & Security', 'Software & Development']::text[]
)
WHERE 'Software & AI' = ANY("source_categories");
--> statement-breakpoint
UPDATE "finance_rules"
SET "actions" = (
  SELECT jsonb_agg(
    CASE
      WHEN action->>'op' = 'set'
        AND action->>'field' = 'category'
        AND action->>'value' = 'Software & AI'
      THEN jsonb_set(
        action,
        '{value}',
        to_jsonb(
          CASE
            WHEN "finance_rules"."seeded_id" IN ('anthropic', 'xai') THEN 'AI'
            ELSE 'Software & Development'
          END::text
        )
      )
      ELSE action
    END
    ORDER BY ordinal
  )
  FROM jsonb_array_elements("finance_rules"."actions") WITH ORDINALITY AS entries(action, ordinal)
)
WHERE "actions" @> '[{"op":"set","field":"category","value":"Software & AI"}]'::jsonb;
--> statement-breakpoint
UPDATE "finance_rules"
SET "conditions" = '[{"field":"merchant","op":"matches","value":{"source":"^(MICROSOFT|ADOBE|JETBRAINS)","flags":""}}]'::jsonb
WHERE "seeded_id" = 'software-vendors'
  AND "conditions" = '[{"field":"merchant","op":"matches","value":{"source":"^(OPENAI|MICROSOFT|ADOBE|GOOGLE (ONE|STORAGE)|DROPBOX|JETBRAINS|1PASSWORD)","flags":""}}]'::jsonb;
--> statement-breakpoint
WITH user_keys AS (
  SELECT "user_id", max("sort_key") AS "last_key"
  FROM "finance_rules"
  GROUP BY "user_id"
), new_rules AS (
  SELECT
    "user_id",
    'openai'::text AS "seeded_id",
    'openai'::text AS "name",
    "last_key" || 'V' AS "sort_key",
    '[{"field":"merchant","op":"matches","value":{"source":"^OPENAI","flags":""}}]'::jsonb AS "conditions",
    '[{"op":"set","field":"category","value":"AI"},{"op":"name-payee","value":"OpenAI"}]'::jsonb AS "actions"
  FROM user_keys
  UNION ALL
  SELECT
    "user_id",
    'productivity-security'::text,
    'productivity-security'::text,
    "last_key" || 'VV',
    '[{"field":"merchant","op":"matches","value":{"source":"^(DROPBOX|1PASSWORD|SANEBOX|GOOGLE (ONE|STORAGE))","flags":""}}]'::jsonb,
    '[{"op":"set","field":"category","value":"Productivity & Security"}]'::jsonb
  FROM user_keys
)
INSERT INTO "finance_rules" (
  "id", "user_id", "name", "conditions", "actions", "sort_key", "seeded_id"
)
SELECT gen_random_uuid(), "user_id", "name", "conditions", "actions", "sort_key", "seeded_id"
FROM new_rules
ON CONFLICT DO NOTHING;
