CREATE TABLE "finance_category_cutovers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tagged_transactions" integer DEFAULT 0 NOT NULL,
	"mapped_transactions" integer DEFAULT 0 NOT NULL,
	"unresolved_rules" integer DEFAULT 0 NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_category_cutovers" ADD CONSTRAINT "finance_category_cutovers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "finance_category_cutovers" (
	"user_id",
	"tagged_transactions",
	"mapped_transactions",
	"unresolved_rules",
	"applied_at"
)
SELECT
	u."id",
	(SELECT count(*)::int FROM "finance_transactions" t WHERE t."user_id" = u."id" AND t."notes" ~ '(^|[^#])#[^#[:space:]]+'),
	(SELECT count(*)::int FROM "finance_transactions" t WHERE t."user_id" = u."id" AND t."budget_category_id" IS NOT NULL),
	(SELECT count(*)::int FROM "finance_rules" r WHERE r."user_id" = u."id" AND r."category_review_required" = true),
	now()
FROM "users" u
WHERE EXISTS (SELECT 1 FROM "finance_transactions" t WHERE t."user_id" = u."id")
   OR EXISTS (SELECT 1 FROM "finance_rules" r WHERE r."user_id" = u."id")
ON CONFLICT ("user_id") DO UPDATE SET
	"tagged_transactions" = EXCLUDED."tagged_transactions",
	"mapped_transactions" = EXCLUDED."mapped_transactions",
	"unresolved_rules" = EXCLUDED."unresolved_rules",
	"applied_at" = EXCLUDED."applied_at";
