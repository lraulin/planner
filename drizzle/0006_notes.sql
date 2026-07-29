CREATE TYPE "public"."note_flag" AS ENUM('none', 'done', 'blue', 'cyan', 'green', 'orange', 'purple', 'red', 'yellow');--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"sort_key" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"note_date" timestamp with time zone,
	"flag" "note_flag" DEFAULT 'none' NOT NULL,
	"contexts" text[] DEFAULT '{}' NOT NULL,
	"collapsed" boolean DEFAULT false NOT NULL,
	"node_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_sibling_sort_key_uq" UNIQUE NULLS NOT DISTINCT("user_id","parent_id","sort_key")
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_parent_id_notes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_user_parent_sort_idx" ON "notes" USING btree ("user_id","parent_id","sort_key");--> statement-breakpoint
CREATE INDEX "notes_user_node_idx" ON "notes" USING btree ("user_id","node_id");
