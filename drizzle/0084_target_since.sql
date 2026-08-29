-- Backfill `target.since` — the day a target started asking. Anchors before it are not counted,
-- which is what stops a target created on the last Friday of the month from asking for the four
-- Fridays that predate it. See agent-os/specs/2026-08-28-2039-target-refill-basis/ D2.
--
-- `created_at` is the closest thing stored to when the envelope started asking. It over-counts
-- for a target added long after its envelope was created; nothing on the row can do better, and
-- it is exactly right for every envelope that got its target at import.
--
-- `created_at` is a true instant, so it is read in the app's wall-clock zone rather than UTC:
-- an envelope created at 8pm Eastern is a US-Eastern evening, not the next UTC day
-- (standards/development/dates.md).
UPDATE "finance_budget_categories"
SET "target" = "target" || jsonb_build_object(
		'since',
		to_char("created_at" AT TIME ZONE 'America/New_York', 'YYYY-MM-DD')
	)
WHERE "target" IS NOT NULL
	AND NOT ("target" ? 'since');
