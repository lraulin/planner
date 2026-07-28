CREATE TYPE "public"."recurrence_end" AS ENUM('never', 'count', 'until');--> statement-breakpoint
CREATE TYPE "public"."recurrence_frequency" AS ENUM('none', 'daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."show_as" AS ENUM('busy', 'free', 'tentative', 'out_of_office');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"reminder_minutes" integer,
	"show_as" "show_as" DEFAULT 'busy' NOT NULL,
	"priority_letter" "priority_letter",
	"priority_rank" smallint,
	"project_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"contexts" text[] DEFAULT '{}' NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"recurrence_frequency" "recurrence_frequency" DEFAULT 'none' NOT NULL,
	"recurrence_interval" integer DEFAULT 1 NOT NULL,
	"recurrence_by_weekday" smallint[],
	"recurrence_end" "recurrence_end" DEFAULT 'never' NOT NULL,
	"recurrence_count" integer,
	"recurrence_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_chart_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"time_chart_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"result_area_id" uuid,
	"days_of_week" smallint[] DEFAULT '{}' NOT NULL,
	"start_minute" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"label_enabled" boolean DEFAULT true NOT NULL,
	"fore_color" text DEFAULT '#1b1d23' NOT NULL,
	"back_color" text DEFAULT '#c8e0f0' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_project_id_nodes_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_chart_areas" ADD CONSTRAINT "time_chart_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_chart_areas" ADD CONSTRAINT "time_chart_areas_time_chart_id_time_charts_id_fk" FOREIGN KEY ("time_chart_id") REFERENCES "public"."time_charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_chart_areas" ADD CONSTRAINT "time_chart_areas_result_area_id_nodes_id_fk" FOREIGN KEY ("result_area_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_charts" ADD CONSTRAINT "time_charts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_user_range_idx" ON "appointments" USING btree ("user_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "appointments_user_project_idx" ON "appointments" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "time_chart_areas_chart_idx" ON "time_chart_areas" USING btree ("user_id","time_chart_id");--> statement-breakpoint
CREATE INDEX "time_charts_user_idx" ON "time_charts" USING btree ("user_id");