CREATE TABLE "finance_recurring_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant" text NOT NULL,
	"cadence_months" smallint NOT NULL,
	"expected_cents" integer,
	"anchor_date" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_recurring_bills_cadence_months" CHECK ("finance_recurring_bills"."cadence_months" >= 1 and "finance_recurring_bills"."cadence_months" <= 24)
);
--> statement-breakpoint
ALTER TABLE "finance_recurring_bills" ADD CONSTRAINT "finance_recurring_bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_recurring_bills_merchant_uq" ON "finance_recurring_bills" USING btree ("user_id","merchant");