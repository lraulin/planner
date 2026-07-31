ALTER TABLE "nodes" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "nodes_external_ref_uq" ON "nodes" USING btree ("user_id","external_source","external_id") WHERE "nodes"."external_id" is not null;