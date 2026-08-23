CREATE TABLE "finance_payee_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"payee_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_payees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"commitment_bill_id" uuid,
	"commitment_spend_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_payees_single_commitment" CHECK (num_nonnulls("finance_payees"."commitment_bill_id", "finance_payees"."commitment_spend_id") <= 1)
);
--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "payee_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_payee_aliases" ADD CONSTRAINT "finance_payee_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payee_aliases" ADD CONSTRAINT "finance_payee_aliases_payee_id_finance_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."finance_payees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD CONSTRAINT "finance_payees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD CONSTRAINT "finance_payees_commitment_bill_id_finance_recurring_bills_id_fk" FOREIGN KEY ("commitment_bill_id") REFERENCES "public"."finance_recurring_bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_payees" ADD CONSTRAINT "finance_payees_commitment_spend_id_finance_recurring_spend_id_fk" FOREIGN KEY ("commitment_spend_id") REFERENCES "public"."finance_recurring_spend"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_payee_aliases_user_alias_uq" ON "finance_payee_aliases" USING btree ("user_id","alias");--> statement-breakpoint
CREATE INDEX "finance_payee_aliases_user_payee_idx" ON "finance_payee_aliases" USING btree ("user_id","payee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_payees_user_name_uq" ON "finance_payees" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "finance_payees_commitment_bill_idx" ON "finance_payees" USING btree ("user_id","commitment_bill_id") WHERE "finance_payees"."commitment_bill_id" is not null;--> statement-breakpoint
CREATE INDEX "finance_payees_commitment_spend_idx" ON "finance_payees" USING btree ("user_id","commitment_spend_id") WHERE "finance_payees"."commitment_spend_id" is not null;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_payee_id_finance_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."finance_payees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_transactions_payee_idx" ON "finance_transactions" USING btree ("user_id","payee_id","transaction_date") WHERE "finance_transactions"."payee_id" is not null;