CREATE TABLE "weekly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"week_starts_on" smallint DEFAULT 0 NOT NULL,
	"review_areas_goals" boolean DEFAULT true NOT NULL,
	"available_minutes" integer,
	"time_chart_id" uuid,
	"block_size_minutes" integer DEFAULT 90 NOT NULL,
	"avoid_collisions" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plans_user_week_uq" UNIQUE("user_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "weekly_plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"focus" boolean DEFAULT false NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"rewrite" text DEFAULT '' NOT NULL,
	"committed_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_plan_entries_plan_node_uq" UNIQUE("plan_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_time_chart_id_time_charts_id_fk" FOREIGN KEY ("time_chart_id") REFERENCES "public"."time_charts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_entries" ADD CONSTRAINT "weekly_plan_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_entries" ADD CONSTRAINT "weekly_plan_entries_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_entries" ADD CONSTRAINT "weekly_plan_entries_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_plan_entries_plan_idx" ON "weekly_plan_entries" USING btree ("user_id","plan_id");
