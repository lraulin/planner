CREATE TABLE "google_calendar_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_id" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"background_color" text DEFAULT '' NOT NULL,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_links_user_cal_uq" UNIQUE("user_id","calendar_id")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "external_series_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "external_calendar_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "external_etag" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "external_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "google_calendar_links" ADD CONSTRAINT "google_calendar_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_external_ref_uq" ON "appointments" USING btree ("user_id","external_source","external_id") WHERE "appointments"."external_id" is not null;