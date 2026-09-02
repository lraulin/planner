-- Strip the 22 tag tokens the 2026-08-23 taxonomy cutover wrote into user notes.
-- Named literally rather than matched as a generic `#`-token so this file is the permanent
-- record of exactly which strings were deleted from user-authored text. The leading
-- separator is consumed with the token and the result trimmed, so a note that was only a
-- tag becomes '' and `baby stuff #shopping` becomes `baby stuff`.
UPDATE "finance_transactions"
SET "notes" = btrim(
  regexp_replace(
    "notes",
    '(^|[[:space:]])#(ai|dining|entertainment|fees-and-interest|games|gas-and-auto|groceries|health|home-and-security|insurance|personal-care|pets|phone-and-internet|productivity-and-security|professional-services|rent-and-housing|shopping|software-and-development|streaming-and-media|taxes|travel|utilities)(?=$|[[:space:]])',
    '',
    'g'
  )
)
WHERE "notes" ~ '(^|[[:space:]])#(ai|dining|entertainment|fees-and-interest|games|gas-and-auto|groceries|health|home-and-security|insurance|personal-care|pets|phone-and-internet|productivity-and-security|professional-services|rent-and-housing|shopping|software-and-development|streaming-and-media|taxes|travel|utilities)(?=$|[[:space:]])';--> statement-breakpoint

DROP TABLE "finance_category_cutovers" CASCADE;--> statement-breakpoint
DROP TABLE "finance_tags" CASCADE;--> statement-breakpoint
ALTER TABLE "finance_transactions" DROP COLUMN "category";
