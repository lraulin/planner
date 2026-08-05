CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"short_name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"contact_id" uuid,
	"overhead_percent" numeric(6, 2) DEFAULT '0' NOT NULL,
	"effectiveness_percent" numeric(7, 2) DEFAULT '100' NOT NULL,
	"monday_minutes" integer DEFAULT 0 NOT NULL,
	"tuesday_minutes" integer DEFAULT 0 NOT NULL,
	"wednesday_minutes" integer DEFAULT 0 NOT NULL,
	"thursday_minutes" integer DEFAULT 0 NOT NULL,
	"friday_minutes" integer DEFAULT 0 NOT NULL,
	"saturday_minutes" integer DEFAULT 0 NOT NULL,
	"sunday_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_percent_ranges" CHECK ("resources"."overhead_percent" between 0 and 100
          and "resources"."effectiveness_percent" >= 0),
	CONSTRAINT "resources_day_minutes_nonnegative" CHECK ("resources"."monday_minutes" >= 0 and "resources"."tuesday_minutes" >= 0
          and "resources"."wednesday_minutes" >= 0 and "resources"."thursday_minutes" >= 0
          and "resources"."friday_minutes" >= 0 and "resources"."saturday_minutes" >= 0
          and "resources"."sunday_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resources_user_short_name_idx" ON "resources" USING btree ("user_id","short_name");--> statement-breakpoint
CREATE INDEX "resources_user_contact_idx" ON "resources" USING btree ("user_id","contact_id");