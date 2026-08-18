ALTER TABLE "jobs" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "life_events" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "life_events" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "residences" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "residences" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_external_ref_uq" ON "jobs" USING btree ("user_id","external_source","external_id") WHERE "jobs"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "life_events_external_ref_uq" ON "life_events" USING btree ("user_id","external_source","external_id") WHERE "life_events"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "residences_external_ref_uq" ON "residences" USING btree ("user_id","external_source","external_id") WHERE "residences"."external_id" is not null;