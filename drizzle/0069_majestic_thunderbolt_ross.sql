CREATE TABLE "finance_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"color" text,
	"description" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_tags_valid_tag" CHECK ("finance_tags"."tag" <> '' and "finance_tags"."tag" !~ '[#[:space:]]'),
	CONSTRAINT "finance_tags_valid_color" CHECK ("finance_tags"."color" is null or "finance_tags"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
ALTER TABLE "finance_payees" ADD COLUMN "learn_categories" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_rules" ADD COLUMN "category_review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_tags" ADD CONSTRAINT "finance_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_tags_user_tag_uq" ON "finance_tags" USING btree ("user_id","tag");--> statement-breakpoint
CREATE INDEX "finance_tags_user_hidden_idx" ON "finance_tags" USING btree ("user_id","hidden");--> statement-breakpoint

-- The retired classifier's effective label becomes a note tag. The fixed corpus is ASCII;
-- arbitrary labels still degrade deterministically instead of blocking the deploy.
WITH effective AS (
  SELECT id, user_id, notes, coalesce(category, derived_category) AS label
  FROM finance_transactions
  WHERE coalesce(category, derived_category) IS NOT NULL
), tagged AS (
  SELECT *, coalesce(nullif(trim(both '-' from regexp_replace(lower(replace(label, '&', ' and ')), '[^a-z0-9]+', '-', 'g')), ''), 'category') AS tag
  FROM effective
)
UPDATE finance_transactions AS transaction
SET notes = transaction.notes || CASE WHEN transaction.notes = '' OR transaction.notes ~ '[[:space:]]$' THEN '' ELSE ' ' END || '#' || tagged.tag,
    updated_at = now()
FROM tagged
WHERE transaction.id = tagged.id
  AND transaction.notes !~ ('(^|[^#])#' || tagged.tag || '($|[[:space:]#])');--> statement-breakpoint

WITH effective AS (
  SELECT DISTINCT user_id, coalesce(category, derived_category) AS label
  FROM finance_transactions
  WHERE coalesce(category, derived_category) IS NOT NULL
), tagged AS (
  SELECT user_id, coalesce(nullif(trim(both '-' from regexp_replace(lower(replace(label, '&', ' and ')), '[^a-z0-9]+', '-', 'g')), ''), 'category') AS tag,
         label
  FROM effective
)
INSERT INTO finance_tags (user_id, tag, description)
SELECT user_id, tag, 'Migrated from legacy category “' || label || '”.'
FROM tagged
ON CONFLICT (user_id, tag) DO NOTHING;--> statement-breakpoint

-- Preserve direct assignments. Fill only nulls where exactly one envelope claimed the old label.
WITH category_map AS (
  SELECT category.user_id, source.label,
         min(category.id::text)::uuid AS category_id,
         count(*)::int AS matches
  FROM finance_budget_categories AS category
  CROSS JOIN LATERAL unnest(category.source_categories) AS source(label)
  GROUP BY category.user_id, source.label
), effective AS (
  SELECT id, user_id, coalesce(category, derived_category) AS label
  FROM finance_transactions
  WHERE budget_category_id IS NULL
)
UPDATE finance_transactions AS transaction
SET budget_category_id = category_map.category_id,
    updated_at = now()
FROM effective
JOIN category_map
  ON category_map.user_id = effective.user_id
 AND category_map.label = effective.label
 AND category_map.matches = 1
WHERE transaction.id = effective.id;--> statement-breakpoint

-- Category actions now point directly at the user's envelope and also preserve the old label
-- as an idempotent Add tag action. Missing/ambiguous mappings stay tag-only and require review.
WITH category_map AS (
  SELECT category.user_id, source.label,
         min(category.id::text)::uuid AS category_id,
         count(*)::int AS matches
  FROM finance_budget_categories AS category
  CROSS JOIN LATERAL unnest(category.source_categories) AS source(label)
  GROUP BY category.user_id, source.label
), rebuilt AS (
  SELECT rule.id,
         jsonb_agg(output.action ORDER BY element.ordinality, output.action_order) AS actions,
         bool_or(
           element.action->>'op' = 'set'
           AND element.action->>'field' = 'category'
           AND coalesce(category_map.matches, 0) <> 1
         ) AS review
  FROM finance_rules AS rule
  CROSS JOIN LATERAL jsonb_array_elements(rule.actions) WITH ORDINALITY AS element(action, ordinality)
  LEFT JOIN category_map
    ON category_map.user_id = rule.user_id
   AND category_map.label = element.action->>'value'
  CROSS JOIN LATERAL (
    SELECT element.action AS action, 0 AS action_order
    WHERE NOT (element.action->>'op' = 'set' AND element.action->>'field' = 'category')
    UNION ALL
    SELECT jsonb_build_object('op', 'set', 'field', 'category', 'value', category_map.category_id::text), 0
    WHERE element.action->>'op' = 'set' AND element.action->>'field' = 'category' AND category_map.matches = 1
    UNION ALL
    SELECT jsonb_build_object(
             'op', 'add-tag',
             'value', coalesce(nullif(trim(both '-' from regexp_replace(lower(replace(element.action->>'value', '&', ' and ')), '[^a-z0-9]+', '-', 'g')), ''), 'category')
           ), 1
    WHERE element.action->>'op' = 'set' AND element.action->>'field' = 'category'
  ) AS output
  GROUP BY rule.id
)
UPDATE finance_rules AS rule
SET actions = rebuilt.actions,
    category_review_required = rebuilt.review,
    updated_at = now()
FROM rebuilt
WHERE rule.id = rebuilt.id;--> statement-breakpoint

-- A commitment's old category was a standing payee classification. Preserve that assertion as
-- a normal exact-payee rule, last in visible order, before the commitment field becomes Group.
WITH declarations AS (
  SELECT payee.id AS payee_id, payee.user_id, payee.name,
         coalesce(bill.category, spend.category) AS label,
         row_number() OVER (PARTITION BY payee.user_id ORDER BY payee.name, payee.id) AS position,
         coalesce((SELECT max(length(rule.sort_key)) FROM finance_rules AS rule WHERE rule.user_id = payee.user_id), 1) AS base_length
  FROM finance_payees AS payee
  LEFT JOIN finance_recurring_bills AS bill ON bill.id = payee.commitment_bill_id AND bill.user_id = payee.user_id
  LEFT JOIN finance_recurring_spend AS spend ON spend.id = payee.commitment_spend_id AND spend.user_id = payee.user_id
  WHERE coalesce(bill.category, spend.category, '') <> ''
), category_map AS (
  SELECT category.user_id, source.label,
         min(category.id::text)::uuid AS category_id,
         count(*)::int AS matches
  FROM finance_budget_categories AS category
  CROSS JOIN LATERAL unnest(category.source_categories) AS source(label)
  GROUP BY category.user_id, source.label
)
INSERT INTO finance_rules (
  user_id, name, conditions, actions, enabled, sort_key, category_review_required, notes
)
SELECT declaration.user_id,
       'Commitment category · ' || declaration.name || ' · ' || left(declaration.payee_id::text, 8),
       jsonb_build_array(jsonb_build_object('field', 'payee', 'op', 'is', 'value', declaration.payee_id::text)),
       CASE WHEN category_map.matches = 1 THEN
         jsonb_build_array(
           jsonb_build_object('op', 'set', 'field', 'category', 'value', category_map.category_id::text),
           jsonb_build_object('op', 'add-tag', 'value', coalesce(nullif(trim(both '-' from regexp_replace(lower(replace(declaration.label, '&', ' and ')), '[^a-z0-9]+', '-', 'g')), ''), 'category'))
         )
       ELSE
         jsonb_build_array(
           jsonb_build_object('op', 'add-tag', 'value', coalesce(nullif(trim(both '-' from regexp_replace(lower(replace(declaration.label, '&', ' and ')), '[^a-z0-9]+', '-', 'g')), ''), 'category'))
         )
       END,
       true,
       repeat('z', declaration.base_length + declaration.position::int) || 'V',
       coalesce(category_map.matches, 0) <> 1,
       'Migrated from the commitment Category that previously reclassified this payee.'
FROM declarations AS declaration
LEFT JOIN category_map
  ON category_map.user_id = declaration.user_id
 AND category_map.label = declaration.label
ON CONFLICT (user_id, sort_key) DO NOTHING;
