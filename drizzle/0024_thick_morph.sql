CREATE TYPE "public"."contact_item_kind" AS ENUM('phone', 'email', 'address', 'url', 'relation', 'event', 'im', 'user_defined');--> statement-breakpoint
CREATE TABLE "contact_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" "contact_item_kind" NOT NULL,
	"sort_key" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"street_address" text DEFAULT '' NOT NULL,
	"extended_address" text DEFAULT '' NOT NULL,
	"po_box" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"country_code" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_items_sibling_sort_key_uq" UNIQUE("user_id","contact_id","kind","sort_key")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name_prefix" text DEFAULT '' NOT NULL,
	"given_name" text DEFAULT '' NOT NULL,
	"middle_name" text DEFAULT '' NOT NULL,
	"family_name" text DEFAULT '' NOT NULL,
	"name_suffix" text DEFAULT '' NOT NULL,
	"nickname" text DEFAULT '' NOT NULL,
	"initials" text DEFAULT '' NOT NULL,
	"file_as" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"manager_name" text DEFAULT '' NOT NULL,
	"assistant_name" text DEFAULT '' NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"birthday_year" smallint,
	"birthday_month" smallint,
	"birthday_day" smallint,
	"photo_url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"contexts" text[] DEFAULT '{}' NOT NULL,
	"external_source" text,
	"external_id" text,
	"external_series_id" text,
	"external_calendar_id" text,
	"external_etag" text,
	"external_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_birthday_month_day_together" CHECK (("contacts"."birthday_month" is null) = ("contacts"."birthday_day" is null)),
	CONSTRAINT "contacts_birthday_ranges" CHECK (("contacts"."birthday_month" is null or "contacts"."birthday_month" between 1 and 12)
          and ("contacts"."birthday_day" is null or "contacts"."birthday_day" between 1 and 31)
          and ("contacts"."birthday_year" is null or "contacts"."birthday_year" between 1000 and 9999))
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "contact_items" ADD CONSTRAINT "contact_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_items" ADD CONSTRAINT "contact_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_items_owner_list_idx" ON "contact_items" USING btree ("user_id","contact_id","kind","sort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_items_primary_uq" ON "contact_items" USING btree ("user_id","contact_id","kind") WHERE "contact_items"."is_primary";--> statement-breakpoint
CREATE INDEX "contacts_user_name_idx" ON "contacts" USING btree ("user_id","family_name","given_name");--> statement-breakpoint
CREATE INDEX "contacts_user_company_idx" ON "contacts" USING btree ("user_id","company");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_external_ref_uq" ON "contacts" USING btree ("user_id","external_source","external_id") WHERE "contacts"."external_id" is not null;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_details" ADD CONSTRAINT "task_details_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_user_contact_idx" ON "notes" USING btree ("user_id","contact_id");