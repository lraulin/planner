CREATE TABLE "finance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_key" text NOT NULL,
	"seeded_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_rules_user_name_uq" ON "finance_rules" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "finance_rules_user_sort_uq" ON "finance_rules" USING btree ("user_id","sort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_rules_user_seeded_uq" ON "finance_rules" USING btree ("user_id","seeded_id") WHERE "finance_rules"."seeded_id" is not null;