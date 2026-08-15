CREATE TABLE "finance_payment_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"transaction_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"counterparty" text DEFAULT '' NOT NULL,
	"direction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_payment_resolutions" ADD CONSTRAINT "finance_payment_resolutions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_payment_resolutions_external_uq" ON "finance_payment_resolutions" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "finance_payment_resolutions_user_date_idx" ON "finance_payment_resolutions" USING btree ("user_id","transaction_date");