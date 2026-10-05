CREATE TABLE "finance_supply_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_supply_groups_name_present" CHECK (length(trim("finance_supply_groups"."name")) > 0)
);
--> statement-breakpoint
DROP INDEX "finance_supply_items_user_group_idx";--> statement-breakpoint
ALTER TABLE "finance_supply_items" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_supply_groups" ADD CONSTRAINT "finance_supply_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_supply_groups_user_name_uq" ON "finance_supply_groups" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "finance_supply_items" ADD CONSTRAINT "finance_supply_items_group_id_finance_supply_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."finance_supply_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_supply_items_user_group_idx" ON "finance_supply_items" USING btree ("user_id","group_id");--> statement-breakpoint
INSERT INTO "finance_supply_groups" ("user_id", "name", "sort_key")
SELECT "user_id", "name", 'a' || lpad((row_number() OVER (PARTITION BY "user_id" ORDER BY lower("name")))::text, 4, '0') || '1'
FROM (
	SELECT "user_id", min(trim("group_label")) AS "name"
	FROM "finance_supply_items"
	WHERE trim("group_label") <> ''
	GROUP BY "user_id", lower(trim("group_label"))
) AS "labels";--> statement-breakpoint
UPDATE "finance_supply_items" AS "item"
SET "group_id" = "grp"."id"
FROM "finance_supply_groups" AS "grp"
WHERE "grp"."user_id" = "item"."user_id"
	AND lower("grp"."name") = lower(trim("item"."group_label"))
	AND trim("item"."group_label") <> '';--> statement-breakpoint
ALTER TABLE "finance_supply_items" DROP COLUMN "group_label";