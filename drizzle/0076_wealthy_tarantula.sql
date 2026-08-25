-- Core-kind rows must be on-budget before the CHECK. Production never ran the
-- TypeScript cutover; do that transition here so migrate-on-deploy can finish.
-- Opening rebase is the ledger position the day before startMonth (no pending).
-- Current-month Ready to Assign still reconciles to the live pool (D3).
WITH cores AS (
  SELECT id, user_id
  FROM "finance_accounts"
  WHERE kind IN ('checking', 'savings', 'cash', 'credit_card')
    AND off_budget = true
),
budget AS (
  SELECT user_id,
         value->>'startMonth' AS start_month
  FROM "user_settings"
  WHERE scope = 'budget'
),
deltas AS (
  SELECT
    c.user_id,
    coalesce(sum(
      CASE
        WHEN b.start_month ~ '^\d{4}-\d{2}-01$' THEN (
          SELECT coalesce(round(sum(t.amount) * 100), 0)
          FROM "finance_transactions" t
          WHERE t.account_id = c.id
            AND t.user_id = c.user_id
            AND t.transaction_date < b.start_month::date
        )
        ELSE 0::numeric
      END
    ), 0)::bigint AS delta_cents
  FROM cores c
  LEFT JOIN budget b ON b.user_id = c.user_id
  GROUP BY c.user_id
)
UPDATE "user_settings" AS us
SET
  value = jsonb_set(
    us.value,
    '{openingCents}',
    to_jsonb(coalesce((us.value->>'openingCents')::int, 0) + d.delta_cents::int)
  ),
  updated_at = now()
FROM deltas d
WHERE us.user_id = d.user_id
  AND us.scope = 'budget'
  AND d.delta_cents <> 0;--> statement-breakpoint
UPDATE "finance_accounts"
SET off_budget = false, updated_at = now()
WHERE kind IN ('checking', 'savings', 'cash', 'credit_card')
  AND off_budget = true;--> statement-breakpoint
ALTER TABLE "finance_transactions" DROP COLUMN "planned_withdrawal";--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_core_on_budget" CHECK ("finance_accounts"."kind"::text not in ('checking', 'savings', 'cash', 'credit_card')
          or "finance_accounts"."off_budget" = false);