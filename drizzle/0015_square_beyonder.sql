CREATE TABLE "daily_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"node_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"priority_letter" "priority_letter",
	"priority_rank" smallint,
	"sort_key" text NOT NULL,
	"state" "node_state" DEFAULT 'not_started' NOT NULL,
	"completed_at" timestamp with time zone,
	"forwarded_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_items_day_sort_key_uq" UNIQUE("user_id","day","sort_key")
);
--> statement-breakpoint
ALTER TABLE "daily_items" ADD CONSTRAINT "daily_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_items" ADD CONSTRAINT "daily_items_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_items_user_day_sort_idx" ON "daily_items" USING btree ("user_id","day","sort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_items_open_node_uq" ON "daily_items" USING btree ("user_id","node_id") WHERE "daily_items"."node_id" is not null and "daily_items"."completed_at" is null and "daily_items"."forwarded_to" is null;