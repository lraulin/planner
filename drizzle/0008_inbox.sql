ALTER TABLE "nodes" ADD COLUMN "is_inbox" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "nodes_one_inbox_per_user_uq" ON "nodes" USING btree ("user_id") WHERE "nodes"."is_inbox";
