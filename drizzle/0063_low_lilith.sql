CREATE TABLE "finance_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"posts_transaction" boolean DEFAULT false NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"next_date" date NOT NULL,
	"custom_upcoming_length" text,
	"source_bill_id" uuid,
	"sort_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_schedules" ADD CONSTRAINT "finance_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_schedules" ADD CONSTRAINT "finance_schedules_source_bill_id_finance_recurring_bills_id_fk" FOREIGN KEY ("source_bill_id") REFERENCES "public"."finance_recurring_bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_schedules_name_uq" ON "finance_schedules" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "finance_schedules_user_sort_idx" ON "finance_schedules" USING btree ("user_id","sort_key");--> statement-breakpoint
CREATE INDEX "finance_schedules_source_bill_idx" ON "finance_schedules" USING btree ("user_id","source_bill_id") WHERE "finance_schedules"."source_bill_id" is not null;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_schedule_id_finance_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."finance_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_transactions_schedule_idx" ON "finance_transactions" USING btree ("user_id","schedule_id") WHERE "finance_transactions"."schedule_id" is not null;