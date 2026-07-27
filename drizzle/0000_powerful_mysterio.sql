CREATE TYPE "public"."node_state" AS ENUM('not_started', 'in_progress', 'waiting', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."node_type" AS ENUM('result_area', 'goal', 'project', 'task');--> statement-breakpoint
CREATE TYPE "public"."priority_letter" AS ENUM('A', 'B', 'C', 'D');--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" "node_type" NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"sort_key" text NOT NULL,
	"priority_letter" "priority_letter",
	"priority_rank" smallint,
	"state" "node_state" DEFAULT 'not_started' NOT NULL,
	"deadline" timestamp with time zone,
	"focus" boolean DEFAULT false NOT NULL,
	"collapsed" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nodes_sibling_sort_key_uq" UNIQUE NULLS NOT DISTINCT("user_id","parent_id","sort_key")
);
--> statement-breakpoint
CREATE TABLE "result_area_details" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"color" text,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "task_details" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"effort_minutes" integer,
	"effort_left_minutes" integer,
	"actual_effort_minutes" integer DEFAULT 0 NOT NULL,
	"percent_complete" smallint DEFAULT 0 NOT NULL,
	"contexts" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_parent_id_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_area_details" ADD CONSTRAINT "result_area_details_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_details" ADD CONSTRAINT "task_details_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nodes_user_parent_sort_idx" ON "nodes" USING btree ("user_id","parent_id","sort_key");--> statement-breakpoint
CREATE INDEX "nodes_user_type_idx" ON "nodes" USING btree ("user_id","type");