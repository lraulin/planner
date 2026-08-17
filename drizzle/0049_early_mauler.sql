ALTER TABLE "node_items" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "node_items" ADD CONSTRAINT "node_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "node_items_user_contact_idx" ON "node_items" USING btree ("user_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "node_items_contact_once_uq" ON "node_items" USING btree ("user_id","node_id","contact_id") WHERE "node_items"."kind" = 'contact' and "node_items"."contact_id" is not null;