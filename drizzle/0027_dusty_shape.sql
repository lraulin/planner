ALTER TABLE "notes" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_external_ref_uq" ON "notes" USING btree ("user_id","external_source","external_id") WHERE "notes"."external_id" is not null;