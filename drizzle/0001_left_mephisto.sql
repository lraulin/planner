CREATE TYPE "public"."node_item_kind" AS ENUM('objective', 'constraint', 'strategy', 'stakeholder', 'risk', 'role', 'contact', 'issue', 'attachment', 'guiding_principle', 'wish_want_dont_have', 'wish_dont_want_have', 'wish_want_have', 'wish_want_avoid');--> statement-breakpoint
CREATE TYPE "public"."sensitivity" AS ENUM('normal', 'personal', 'private', 'confidential');--> statement-breakpoint
CREATE TABLE "node_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"kind" "node_item_kind" NOT NULL,
	"sort_key" text NOT NULL,
	"priority_letter" "priority_letter",
	"priority_rank" smallint,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"criteria" text DEFAULT '' NOT NULL,
	"stakeholders" text DEFAULT '' NOT NULL,
	"item_type" text,
	"stake" text DEFAULT '' NOT NULL,
	"severity" smallint,
	"probability" smallint,
	"detection" text DEFAULT '' NOT NULL,
	"prevention" text DEFAULT '' NOT NULL,
	"mitigation" text DEFAULT '' NOT NULL,
	"advantages" text DEFAULT '' NOT NULL,
	"disadvantages" text DEFAULT '' NOT NULL,
	"decision" text DEFAULT '' NOT NULL,
	"ideal_candidate" text DEFAULT '' NOT NULL,
	"candidates" text DEFAULT '' NOT NULL,
	"filled" boolean DEFAULT false NOT NULL,
	"filled_by" text DEFAULT '' NOT NULL,
	"association" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_items_sibling_sort_key_uq" UNIQUE("user_id","node_id","kind","sort_key")
);
--> statement-breakpoint
CREATE TABLE "project_details" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"project_start" timestamp with time zone,
	"target_end" timestamp with time zone,
	"effort_driven" boolean DEFAULT true NOT NULL,
	"only_show_next_task" boolean DEFAULT false NOT NULL,
	"lead_time_minutes" integer,
	"block_size_minutes" integer,
	"time_per_week_minutes" integer,
	"recompute_task_deadlines" boolean DEFAULT false NOT NULL,
	"reminder_at" timestamp with time zone,
	"sensitivity" "sensitivity" DEFAULT 'normal' NOT NULL,
	"assigned_to" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"contexts" text[] DEFAULT '{}' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"ideal_vision" text DEFAULT '' NOT NULL,
	"sufficient_vision" text DEFAULT '' NOT NULL,
	"strategy" text DEFAULT '' NOT NULL,
	"billing_information" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"mileage" text DEFAULT '' NOT NULL,
	"expected_cost" numeric(12, 2),
	"low_cost" numeric(12, 2),
	"high_cost" numeric(12, 2),
	"cost_to_date" numeric(12, 2),
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "importance" smallint;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "mission" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "ideal_outer_vision" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "ideal_inner_vision" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "strengths" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "weaknesses" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "opportunities" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD COLUMN "threats" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "node_items" ADD CONSTRAINT "node_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_items" ADD CONSTRAINT "node_items_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_details" ADD CONSTRAINT "project_details_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "node_items_owner_list_idx" ON "node_items" USING btree ("user_id","node_id","kind","sort_key");