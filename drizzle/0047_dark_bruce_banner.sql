DROP INDEX "finance_recurring_bills_merchant_uq";--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_recurring_bills_name_uq" ON "finance_recurring_bills" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" DROP COLUMN "merchant";