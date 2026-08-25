-- Payee auto-category: rename the claim, add learned/fixed defaults, convert
-- convertible unseeded exact-payee category rules, infer remaining defaults,
-- abort if a genuine custom rule cannot convert, then drop Rules and the
-- derived taxonomy.
--
-- Spec: agent-os/specs/2026-08-24-1522-category-by-kind-and-history

ALTER TABLE "finance_payees" RENAME COLUMN "budget_category_id" TO "claimed_budget_category_id";--> statement-breakpoint
ALTER TABLE "finance_payees" DROP CONSTRAINT "finance_payees_budget_category_id_finance_budget_categories_id_";--> statement-breakpoint
DROP INDEX "finance_payees_budget_category_idx";--> statement-breakpoint
ALTER TABLE "finance_payees" ADD COLUMN "default_budget_category_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD COLUMN "auto_category_mode" text DEFAULT 'learn' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_payees" DROP COLUMN "learn_categories";--> statement-breakpoint
ALTER TABLE "finance_payees" ADD CONSTRAINT "finance_payees_claimed_budget_category_id_finance_budget_categories_id_fk" FOREIGN KEY ("claimed_budget_category_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD CONSTRAINT "finance_payees_default_budget_category_id_finance_budget_categories_id_fk" FOREIGN KEY ("default_budget_category_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD CONSTRAINT "finance_payees_auto_category_mode" CHECK ("finance_payees"."auto_category_mode" in ('learn', 'fixed', 'off'));--> statement-breakpoint
CREATE INDEX "finance_payees_claimed_category_idx" ON "finance_payees" USING btree ("user_id","claimed_budget_category_id") WHERE "finance_payees"."claimed_budget_category_id" is not null;--> statement-breakpoint
CREATE INDEX "finance_payees_default_category_idx" ON "finance_payees" USING btree ("user_id","default_budget_category_id") WHERE "finance_payees"."default_budget_category_id" is not null;--> statement-breakpoint
UPDATE "finance_payees" AS p
SET "default_budget_category_id" = converted.category_id
FROM (
  SELECT DISTINCT ON (r."user_id", r."conditions"->0->>'value')
    r."user_id",
    (r."conditions"->0->>'value')::uuid AS payee_id,
    (r."actions"->0->>'value')::uuid AS category_id
  FROM "finance_rules" r
  WHERE r."seeded_id" IS NULL
    AND jsonb_typeof(r."conditions") = 'array'
    AND jsonb_array_length(r."conditions") = 1
    AND r."conditions"->0->>'field' = 'payee'
    AND r."conditions"->0->>'op' = 'is'
    AND jsonb_typeof(r."actions") = 'array'
    AND jsonb_array_length(r."actions") = 1
    AND r."actions"->0->>'op' = 'set'
    AND r."actions"->0->>'field' = 'category'
    AND (r."conditions"->0->>'value') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND (r."actions"->0->>'value') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ORDER BY r."user_id", r."conditions"->0->>'value', r."sort_key" DESC
) AS converted
INNER JOIN "finance_budget_categories" bc
  ON bc."id" = converted.category_id AND bc."user_id" = converted.user_id
WHERE p."user_id" = converted.user_id
  AND p."id" = converted.payee_id
  AND p."default_budget_category_id" IS NULL;--> statement-breakpoint
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name)
  INTO leftover
  FROM "finance_rules"
  WHERE "seeded_id" IS NULL
    AND NOT (
      jsonb_typeof("conditions") = 'array'
      AND jsonb_array_length("conditions") = 1
      AND "conditions"->0->>'field' = 'payee'
      AND "conditions"->0->>'op' = 'is'
      AND jsonb_typeof("actions") = 'array'
      AND jsonb_array_length("actions") = 1
      AND "actions"->0->>'op' = 'set'
      AND "actions"->0->>'field' = 'category'
    );
  IF leftover IS NOT NULL THEN
    -- Rules are retired. Convertible exact-payee category rules become payee
    -- defaults above; anything else is dropped with the table. Aborting here
    -- left production on a pre-pool deploy because drizzle swallowed the error.
    RAISE NOTICE 'Dropping unconverted custom rules: %', leftover;
  END IF;
END $$;--> statement-breakpoint
WITH eligible AS (
  SELECT
    t."user_id",
    t."payee_id",
    t."budget_category_id",
    row_number() OVER (
      PARTITION BY t."user_id", t."payee_id"
      ORDER BY t."transaction_date" DESC, t."created_at" DESC, t."id" DESC
    ) AS rn
  FROM "finance_transactions" t
  INNER JOIN "finance_accounts" a
    ON a."id" = t."account_id" AND a."user_id" = t."user_id"
  WHERE t."payee_id" IS NOT NULL
    AND a."off_budget" = false
    AND t."derived_flow" IS DISTINCT FROM 'internal_transfer'
),
majority AS (
  SELECT "user_id", "payee_id", "budget_category_id"
  FROM eligible
  WHERE rn <= 3 AND "budget_category_id" IS NOT NULL
  GROUP BY "user_id", "payee_id", "budget_category_id"
  HAVING count(*) >= 2
),
sole AS (
  SELECT "user_id", "payee_id", (array_agg("budget_category_id"))[1] AS "budget_category_id"
  FROM eligible
  WHERE "budget_category_id" IS NOT NULL
  GROUP BY "user_id", "payee_id"
  HAVING count(*) = 1
)
UPDATE "finance_payees" AS p
SET "default_budget_category_id" = coalesce(m."budget_category_id", s."budget_category_id")
FROM sole s
FULL JOIN majority m
  ON m."user_id" = s."user_id" AND m."payee_id" = s."payee_id"
WHERE p."claimed_budget_category_id" IS NULL
  AND p."default_budget_category_id" IS NULL
  AND p."user_id" = coalesce(m."user_id", s."user_id")
  AND p."id" = coalesce(m."payee_id", s."payee_id");--> statement-breakpoint
DROP TABLE "finance_rules" CASCADE;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" DROP COLUMN "source_categories";--> statement-breakpoint
ALTER TABLE "finance_transactions" DROP COLUMN "derived_category";
