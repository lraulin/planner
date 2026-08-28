ALTER TABLE "finance_budget_categories" ADD COLUMN "target" jsonb;--> statement-breakpoint
-- One target per envelope. Remainder is dropped; more than one line keeps the lowest
-- priority. weekly becomes upTo (leftover cash covers the next occurrence). See
-- src/lib/finances/budget/targets/fromTemplates.ts for the TypeScript twin of this mapping.
WITH expanded AS (
	SELECT
		c.id,
		line,
		ordinality,
		CASE
			WHEN line->>'type' = 'remainder' THEN NULL
			ELSE COALESCE((line->>'priority')::int, 0)
		END AS priority
	FROM "finance_budget_categories" c
	LEFT JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof(c.templates) = 'array' THEN c.templates
			ELSE '[]'::jsonb
		END
	) WITH ORDINALITY AS t(line, ordinality) ON true
),
ranked AS (
	SELECT
		id,
		line,
		ROW_NUMBER() OVER (
			PARTITION BY id
			ORDER BY priority ASC NULLS LAST, ordinality ASC
		) AS rn
	FROM expanded
	WHERE priority IS NOT NULL
),
converted AS (
	SELECT
		id,
		CASE
			WHEN line->>'type' = 'simple'
				AND COALESCE((line->>'monthlyCents')::int, 0) > 0
			THEN jsonb_build_object(
				'behavior', 'add',
				'cadence', jsonb_build_object('unit', 'month', 'day', 31),
				'amountCents', (line->>'monthlyCents')::int
			)
			WHEN line->>'type' = 'simple'
				AND COALESCE((line->'limit'->>'amountCents')::int, 0) > 0
			THEN jsonb_build_object(
				'behavior', 'upTo',
				'cadence', jsonb_build_object('unit', 'month', 'day', 31),
				'amountCents', (line->'limit'->>'amountCents')::int
			)
			WHEN line->>'type' = 'weekly'
				AND COALESCE((line->>'amountCents')::int, 0) > 0
				AND (line->>'weekday')::int BETWEEN 0 AND 6
			THEN jsonb_build_object(
				'behavior', 'upTo',
				'cadence', jsonb_build_object(
					'unit', 'week',
					'weekday', (line->>'weekday')::int
				),
				'amountCents', (line->>'amountCents')::int
			)
			WHEN line->>'type' = 'by'
				AND COALESCE((line->>'amountCents')::int, 0) > 0
				AND (line->>'annual') = 'true'
				AND (line->>'month') ~ '^\d{4}-(0[1-9]|1[0-2])$'
			THEN jsonb_build_object(
				'behavior', 'upTo',
				'cadence', jsonb_build_object(
					'unit', 'year',
					'month', substring(line->>'month' from 6 for 2)::int
				),
				'amountCents', (line->>'amountCents')::int
			)
			WHEN line->>'type' = 'by'
				AND COALESCE((line->>'amountCents')::int, 0) > 0
				AND (line->>'month') ~ '^\d{4}-(0[1-9]|1[0-2])$'
			THEN jsonb_build_object(
				'behavior', 'balance',
				'cadence', jsonb_build_object('unit', 'by', 'month', line->>'month'),
				'amountCents', (line->>'amountCents')::int
			)
			ELSE NULL
		END AS target
	FROM ranked
	WHERE rn = 1
)
UPDATE "finance_budget_categories" AS c
SET "target" = converted.target
FROM converted
WHERE c.id = converted.id
	AND converted.target IS NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_budget_categories" DROP COLUMN "templates";