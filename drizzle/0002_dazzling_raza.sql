CREATE TYPE "public"."progress_review" AS ENUM('none', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."task_constraint" AS ENUM('as_soon_as_possible', 'as_late_as_possible', 'start_no_earlier_than', 'start_no_later_than', 'finish_no_earlier_than', 'finish_no_later_than', 'must_start_on', 'must_finish_on');--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'benefit';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'obstacle';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'action';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'belief';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'resource';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'environment';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'reward';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'metric';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'progress_entry';--> statement-breakpoint
ALTER TYPE "public"."node_item_kind" ADD VALUE 'goal_win';--> statement-breakpoint
ALTER TYPE "public"."node_state" ADD VALUE 'postponed';--> statement-breakpoint
ALTER TYPE "public"."node_state" ADD VALUE 'delegated';--> statement-breakpoint
ALTER TYPE "public"."node_state" ADD VALUE 'should_delegate';--> statement-breakpoint
ALTER TYPE "public"."node_state" ADD VALUE 'proposed';--> statement-breakpoint
CREATE TABLE "goal_details" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"is_dream" boolean DEFAULT false NOT NULL,
	"range" text DEFAULT '' NOT NULL,
	"planned_start" timestamp with time zone,
	"values" text DEFAULT '' NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"affirmation" text DEFAULT '' NOT NULL,
	"definition" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"contexts" text[] DEFAULT '{}' NOT NULL,
	"vision" text DEFAULT '' NOT NULL,
	"kind_of_person" text DEFAULT '' NOT NULL,
	"personal_changes" text DEFAULT '' NOT NULL,
	"baseline" text DEFAULT '' NOT NULL,
	"limiting_factor" text DEFAULT '' NOT NULL,
	"strategy" text DEFAULT '' NOT NULL,
	"progress_review" "progress_review" DEFAULT 'none' NOT NULL,
	"scorecard" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "purpose" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "strategy" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "people" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "received" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "conditions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "awarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "question" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "target" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "assigned_to" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "entry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "score" smallint;--> statement-breakpoint
ALTER TABLE "node_items" ADD COLUMN "comments" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "target_start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "target_end_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "deferred_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "lead_time_minutes" integer;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "deadline_lead_time_minutes" integer;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "place" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "effort_driven" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "milestone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "actual_start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "date_completed" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "constraint" "task_constraint" DEFAULT 'as_soon_as_possible' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "constraint_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "wbs" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "cost_low" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "cost_high" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "actual_cost" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "billing_information" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "company" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "mileage" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_details" ADD CONSTRAINT "goal_details_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;