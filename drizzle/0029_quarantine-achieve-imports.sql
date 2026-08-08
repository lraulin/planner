-- Keep previously imported result areas separate from live categories while retaining
-- the old Achieve category in the label. Re-running remains idempotent.
UPDATE "result_area_details" AS "details"
SET "category" = CASE
  WHEN "details"."category" IS NULL OR btrim("details"."category") = ''
    THEN '~ Imported'
  WHEN btrim("details"."category") = '~ Imported'
    OR btrim("details"."category") LIKE '~ Imported:%'
    THEN btrim("details"."category")
  ELSE '~ Imported: ' || btrim("details"."category")
END
FROM "nodes"
WHERE "nodes"."id" = "details"."node_id"
  AND "nodes"."type" = 'result_area'
  AND "nodes"."external_source" = 'achieve';
