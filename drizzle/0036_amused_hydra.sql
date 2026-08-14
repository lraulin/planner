CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"employer" text DEFAULT '' NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"employment_type" text DEFAULT '' NOT NULL,
	"start_date" date,
	"end_date" date,
	"duties" text DEFAULT '' NOT NULL,
	"reason_for_leaving" text DEFAULT '' NOT NULL,
	"starting_pay" numeric(14, 2),
	"ending_pay" numeric(14, 2),
	"pay_period" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"street_address" text DEFAULT '' NOT NULL,
	"extended_address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"country_code" text DEFAULT '' NOT NULL,
	"supervisor_name" text DEFAULT '' NOT NULL,
	"supervisor_title" text DEFAULT '' NOT NULL,
	"supervisor_phone" text DEFAULT '' NOT NULL,
	"supervisor_email" text DEFAULT '' NOT NULL,
	"may_contact_supervisor" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_dates_ordered" CHECK ("jobs"."start_date" is null or "jobs"."end_date" is null
          or "jobs"."end_date" >= "jobs"."start_date")
);
--> statement-breakpoint
CREATE TABLE "life_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"street_address" text DEFAULT '' NOT NULL,
	"extended_address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"country_code" text DEFAULT '' NOT NULL,
	"moved_in" date,
	"moved_out" date,
	"housing_type" text DEFAULT '' NOT NULL,
	"monthly_rent" numeric(14, 2),
	"reason_for_leaving" text DEFAULT '' NOT NULL,
	"landlord_name" text DEFAULT '' NOT NULL,
	"landlord_phone" text DEFAULT '' NOT NULL,
	"landlord_email" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "residences_dates_ordered" CHECK ("residences"."moved_in" is null or "residences"."moved_out" is null
          or "residences"."moved_out" >= "residences"."moved_in")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_events" ADD CONSTRAINT "life_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residences" ADD CONSTRAINT "residences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_user_start_idx" ON "jobs" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE INDEX "life_events_user_date_idx" ON "life_events" USING btree ("user_id","event_date");--> statement-breakpoint
CREATE INDEX "life_events_user_category_idx" ON "life_events" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "residences_user_moved_in_idx" ON "residences" USING btree ("user_id","moved_in");