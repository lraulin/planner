CREATE TABLE "amazon_charge_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"method" text NOT NULL,
	"date_mismatch" boolean DEFAULT false NOT NULL,
	"card_mismatch" boolean DEFAULT false NOT NULL,
	"split_protected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amazon_charge_matches_method" CHECK ("amazon_charge_matches"."method" in ('automatic', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "amazon_charge_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amazon_order_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amazon_payment_id" text NOT NULL,
	"payment_date" date,
	"amount" numeric(14, 2),
	"status" text DEFAULT 'unknown' NOT NULL,
	"card_last4" text,
	"instrument_kind" text DEFAULT 'other' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text DEFAULT '' NOT NULL,
	"captured_on" date,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amazon_charges_status" CHECK ("amazon_charges"."status" in ('completed', 'pending', 'refunded', 'unknown')),
	CONSTRAINT "amazon_charges_instrument" CHECK ("amazon_charges"."instrument_kind" in ('card', 'rewards', 'gift', 'other'))
);
--> statement-breakpoint
CREATE TABLE "amazon_receipt_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"line_id" text NOT NULL,
	"amazon_order_id" text DEFAULT '' NOT NULL,
	"asin" text DEFAULT '' NOT NULL,
	"amazon_subscription_id" text,
	"bill_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amazon_receipt_allocations_kind" CHECK ("amazon_receipt_allocations"."kind" in ('subscription', 'remainder', 'unassigned'))
);
--> statement-breakpoint
CREATE TABLE "amazon_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amazon_subscription_id" text NOT NULL,
	"asin" text DEFAULT '' NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"cadence_months" smallint,
	"cadence_days" smallint,
	"cadence_label" text DEFAULT '' NOT NULL,
	"next_delivery_date" date,
	"status" text DEFAULT 'unknown' NOT NULL,
	"bill_id" uuid,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text DEFAULT '' NOT NULL,
	"captured_on" date,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amazon_subscriptions_status" CHECK ("amazon_subscriptions"."status" in ('active', 'attention', 'cancelled', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "amazon_charge_matches" ADD CONSTRAINT "amazon_charge_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_charge_matches" ADD CONSTRAINT "amazon_charge_matches_charge_id_amazon_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."amazon_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_charge_matches" ADD CONSTRAINT "amazon_charge_matches_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_charge_orders" ADD CONSTRAINT "amazon_charge_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_charge_orders" ADD CONSTRAINT "amazon_charge_orders_charge_id_amazon_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."amazon_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_charges" ADD CONSTRAINT "amazon_charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_receipt_allocations" ADD CONSTRAINT "amazon_receipt_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_receipt_allocations" ADD CONSTRAINT "amazon_receipt_allocations_charge_id_amazon_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."amazon_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_receipt_allocations" ADD CONSTRAINT "amazon_receipt_allocations_bill_id_finance_budget_categories_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_subscriptions" ADD CONSTRAINT "amazon_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_subscriptions" ADD CONSTRAINT "amazon_subscriptions_bill_id_finance_budget_categories_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_charge_matches_user_charge_uq" ON "amazon_charge_matches" USING btree ("user_id","charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_charge_matches_user_txn_uq" ON "amazon_charge_matches" USING btree ("user_id","transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_charge_orders_user_charge_order_uq" ON "amazon_charge_orders" USING btree ("user_id","charge_id","amazon_order_id");--> statement-breakpoint
CREATE INDEX "amazon_charge_orders_user_order_idx" ON "amazon_charge_orders" USING btree ("user_id","amazon_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_charges_user_payment_uq" ON "amazon_charges" USING btree ("user_id","amazon_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_charges_external_ref_uq" ON "amazon_charges" USING btree ("user_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "amazon_charges_user_date_idx" ON "amazon_charges" USING btree ("user_id","payment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_receipt_allocations_user_charge_line_uq" ON "amazon_receipt_allocations" USING btree ("user_id","charge_id","line_id");--> statement-breakpoint
CREATE INDEX "amazon_receipt_allocations_user_bill_idx" ON "amazon_receipt_allocations" USING btree ("user_id","bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_subscriptions_user_sub_uq" ON "amazon_subscriptions" USING btree ("user_id","amazon_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_subscriptions_external_ref_uq" ON "amazon_subscriptions" USING btree ("user_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "amazon_subscriptions_user_bill_idx" ON "amazon_subscriptions" USING btree ("user_id","bill_id");