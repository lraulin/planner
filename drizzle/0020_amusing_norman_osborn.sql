CREATE TABLE "metric_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"entry_type" text DEFAULT 'new_total' NOT NULL,
	"target" numeric(18, 6),
	"value" numeric(18, 6) NOT NULL,
	"external_source" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"owner_node_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"units" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"priority_letter" "priority_letter",
	"priority_rank" smallint,
	"metric_type" text DEFAULT 'total' NOT NULL,
	"objective_target" numeric(18, 6),
	"sort_key" text NOT NULL,
	"external_source" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_user_sort_key_uq" UNIQUE("user_id","sort_key")
);
--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_owner_node_id_nodes_id_fk" FOREIGN KEY ("owner_node_id") REFERENCES "public"."nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "metric_entries_metric_date_idx" ON "metric_entries" USING btree ("user_id","metric_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_external_ref_uq" ON "metric_entries" USING btree ("user_id","external_source","external_id") WHERE "metric_entries"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "metrics_user_sort_idx" ON "metrics" USING btree ("user_id","sort_key");--> statement-breakpoint
CREATE INDEX "metrics_user_owner_idx" ON "metrics" USING btree ("user_id","owner_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_external_ref_uq" ON "metrics" USING btree ("user_id","external_source","external_id") WHERE "metrics"."external_id" is not null;--> statement-breakpoint
-- Backfill first-class metrics from the thin Goal-form node_items rows (kind = metric).
-- sort_key uses the old item id so user-level uniqueness is guaranteed.
INSERT INTO "metrics" (
	"id",
	"user_id",
	"owner_node_id",
	"title",
	"category",
	"question",
	"description",
	"units",
	"active",
	"priority_letter",
	"priority_rank",
	"metric_type",
	"objective_target",
	"sort_key",
	"created_at",
	"updated_at"
)
SELECT
	ni."id",
	ni."user_id",
	ni."node_id",
	ni."title",
	ni."category",
	ni."question",
	ni."description",
	'',
	ni."active",
	ni."priority_letter",
	ni."priority_rank",
	'total',
	CASE
		WHEN ni."target" ~ '^-?[0-9]+(\.[0-9]+)?$' THEN ni."target"::numeric(18, 6)
		ELSE NULL
	END,
	ni."id"::text,
	ni."created_at",
	ni."updated_at"
FROM "node_items" ni
WHERE ni."kind" = 'metric';--> statement-breakpoint
DELETE FROM "node_items" WHERE "kind" = 'metric';