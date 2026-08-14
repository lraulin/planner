CREATE TABLE "amazon_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amazon_order_id" text NOT NULL,
	"channel" text NOT NULL,
	"asin" text DEFAULT '' NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2),
	"unit_price_tax" numeric(14, 2),
	"item_paid" numeric(14, 2),
	"item_tax" numeric(14, 2),
	"discounts" numeric(14, 2),
	"shipping_charge" numeric(14, 2),
	"shipping_option" text DEFAULT '' NOT NULL,
	"shipment_status" text DEFAULT '' NOT NULL,
	"subscribe_and_save" boolean DEFAULT false NOT NULL,
	"ship_date" date,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amazon_order_id" text NOT NULL,
	"channel" text NOT NULL,
	"order_date" date,
	"order_status" text DEFAULT '' NOT NULL,
	"payment_method" text DEFAULT '' NOT NULL,
	"payment_last4" text,
	"website" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amazon_order_id" text NOT NULL,
	"channel" text NOT NULL,
	"refund_date" date,
	"creation_date" date,
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"disbursement_type" text DEFAULT '' NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"asin" text DEFAULT '' NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_replacements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amazon_order_id" text NOT NULL,
	"replacement_order_id" text,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amazon_order_id" text NOT NULL,
	"return_date" date,
	"creation_date" date,
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"replacement_order_id" text DEFAULT '' NOT NULL,
	"external_source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amazon_order_items" ADD CONSTRAINT "amazon_order_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_order_items" ADD CONSTRAINT "amazon_order_items_order_id_amazon_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."amazon_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD CONSTRAINT "amazon_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_refunds" ADD CONSTRAINT "amazon_refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_replacements" ADD CONSTRAINT "amazon_replacements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_returns" ADD CONSTRAINT "amazon_returns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_order_items_external_ref_uq" ON "amazon_order_items" USING btree ("user_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "amazon_order_items_order_idx" ON "amazon_order_items" USING btree ("user_id","order_id");--> statement-breakpoint
CREATE INDEX "amazon_order_items_user_order_idx" ON "amazon_order_items" USING btree ("user_id","amazon_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_orders_user_order_uq" ON "amazon_orders" USING btree ("user_id","amazon_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_orders_external_ref_uq" ON "amazon_orders" USING btree ("user_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "amazon_orders_user_date_idx" ON "amazon_orders" USING btree ("user_id","order_date");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_refunds_external_ref_uq" ON "amazon_refunds" USING btree ("user_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "amazon_refunds_user_order_idx" ON "amazon_refunds" USING btree ("user_id","amazon_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_replacements_external_ref_uq" ON "amazon_replacements" USING btree ("user_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "amazon_replacements_user_order_idx" ON "amazon_replacements" USING btree ("user_id","amazon_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amazon_returns_external_ref_uq" ON "amazon_returns" USING btree ("user_id","external_source","external_id");--> statement-breakpoint
CREATE INDEX "amazon_returns_user_order_idx" ON "amazon_returns" USING btree ("user_id","amazon_order_id");