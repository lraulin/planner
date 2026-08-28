-- A group states which budget table it lives in, instead of it being inferred from whatever
-- envelopes happen to be inside. See agent-os/specs/2026-08-28-1613-group-kind/.
--
-- The derived answer had no value for an *empty* group, which is why an empty group rendered
-- nowhere: creatable, but not visible, addable-to, or deletable.
ALTER TABLE "finance_category_groups" ADD COLUMN "kind" text;--> statement-breakpoint

-- Infer each group's kind from its envelopes, direct and descendant. A group whose envelopes
-- disagree gets no kind here and is dissolved below.
WITH RECURSIVE descendants AS (
	SELECT id AS root_id, id AS group_id
	FROM "finance_category_groups"
	UNION ALL
	SELECT d.root_id, g.id
	FROM descendants d
	JOIN "finance_category_groups" g ON g.parent_group_id = d.group_id
),
kinds AS (
	SELECT d.root_id, count(DISTINCT c.kind) AS distinct_kinds, min(c.kind) AS kind
	FROM descendants d
	JOIN "finance_budget_categories" c ON c.group_id = d.group_id
	GROUP BY d.root_id
)
UPDATE "finance_category_groups" AS g
SET "kind" = kinds.kind
FROM kinds
WHERE g.id = kinds.root_id
	AND kinds.distinct_kinds = 1;--> statement-breakpoint

-- Income renders as a plain list, not a grid (`one-budget` D7: income is not budgeted), so it
-- has never had group chrome and gets none here. An income group is therefore unreachable
-- whatever its kind, so it is dissolved alongside the mixed ones — otherwise the seeded
-- "Income" group survives this migration into exactly the stranded state it exists to fix.
UPDATE "finance_category_groups" SET "kind" = NULL WHERE "kind" = 'income';--> statement-breakpoint

-- Dissolve every group left without a kind: its envelopes disagree, it has none at all, or it
-- is an income group.
-- In practice these are only the seeded chrome groups ("Income", "Spending"), which
-- `sectionGridRows` already hid when they were the lone root header — so the page is
-- unchanged. Envelopes move to their own section root; no money and no history is touched.
--
-- A dissolved group may sit under a kept one, so re-parent surviving children onto the
-- dissolved group's parent before deleting, or the `restrict` FK refuses.
UPDATE "finance_budget_categories" AS c
SET "group_id" = NULL, "updated_at" = now()
FROM "finance_category_groups" g
WHERE c.group_id = g.id AND g.kind IS NULL;--> statement-breakpoint

WITH RECURSIVE lifted AS (
	SELECT g.id, g.parent_group_id
	FROM "finance_category_groups" g
	WHERE g.kind IS NOT NULL
	UNION ALL
	-- Walk up while the parent is being dissolved, so a chain of dissolved ancestors lifts
	-- the survivor all the way rather than one level.
	SELECT l.id, p.parent_group_id
	FROM lifted l
	JOIN "finance_category_groups" p ON p.id = l.parent_group_id
	WHERE p.kind IS NULL
),
nearest AS (
	SELECT l.id, l.parent_group_id
	FROM lifted l
	LEFT JOIN "finance_category_groups" p ON p.id = l.parent_group_id
	WHERE l.parent_group_id IS NULL OR p.kind IS NOT NULL
)
UPDATE "finance_category_groups" AS child
SET "parent_group_id" = nearest.parent_group_id, "updated_at" = now()
FROM nearest
WHERE child.id = nearest.id
	AND child.parent_group_id IS DISTINCT FROM nearest.parent_group_id;--> statement-breakpoint

DELETE FROM "finance_category_groups" WHERE "kind" IS NULL;--> statement-breakpoint

ALTER TABLE "finance_category_groups" ALTER COLUMN "kind" SET NOT NULL;
