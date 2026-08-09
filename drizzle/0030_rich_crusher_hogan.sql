ALTER TABLE "nodes" ALTER COLUMN "state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "nodes" ALTER COLUMN "state" DROP NOT NULL;--> statement-breakpoint
UPDATE "nodes"
SET "state" = NULL, "completed_at" = NULL, "deferred_date" = NULL
WHERE "type" = 'result_area'::node_type;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_lifecycle_state_by_type" CHECK (("nodes"."type" = 'result_area'::node_type and "nodes"."state" is null and "nodes"."completed_at" is null and "nodes"."deferred_date" is null) or ("nodes"."type" <> 'result_area'::node_type and "nodes"."state" is not null));
