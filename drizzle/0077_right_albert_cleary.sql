CREATE TABLE "finance_supply_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"group_label" text DEFAULT '' NOT NULL,
	"envelope_id" uuid,
	"unit_label" text DEFAULT '' NOT NULL,
	"rate_basis" text DEFAULT 'units_per_day' NOT NULL,
	"units_per_day_milli" integer,
	"days_per_unit_tenths" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_supply_items_name_present" CHECK (length(trim("finance_supply_items"."name")) > 0),
	CONSTRAINT "finance_supply_items_rate_basis" CHECK ("finance_supply_items"."rate_basis" in ('units_per_day', 'days_per_unit')),
	CONSTRAINT "finance_supply_items_rate_set" CHECK (("finance_supply_items"."rate_basis" = 'units_per_day'
             and "finance_supply_items"."units_per_day_milli" is not null and "finance_supply_items"."units_per_day_milli" > 0
             and "finance_supply_items"."days_per_unit_tenths" is null)
          or ("finance_supply_items"."rate_basis" = 'days_per_unit'
             and "finance_supply_items"."days_per_unit_tenths" is not null and "finance_supply_items"."days_per_unit_tenths" > 0
             and "finance_supply_items"."units_per_day_milli" is null))
);
--> statement-breakpoint
CREATE TABLE "finance_supply_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"qty_per_item" integer DEFAULT 1 NOT NULL,
	"cost_per_order_cents" integer DEFAULT 0 NOT NULL,
	"in_use" boolean DEFAULT false NOT NULL,
	"priced_on" date,
	"asin" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_supply_options_qty_positive" CHECK ("finance_supply_options"."qty_per_item" > 0),
	CONSTRAINT "finance_supply_options_cost_nonneg" CHECK ("finance_supply_options"."cost_per_order_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "finance_supply_items" ADD CONSTRAINT "finance_supply_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_supply_items" ADD CONSTRAINT "finance_supply_items_envelope_id_finance_budget_categories_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_supply_options" ADD CONSTRAINT "finance_supply_options_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_supply_options" ADD CONSTRAINT "finance_supply_options_item_id_finance_supply_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."finance_supply_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_supply_items_user_group_idx" ON "finance_supply_items" USING btree ("user_id","group_label");--> statement-breakpoint
CREATE INDEX "finance_supply_items_user_envelope_idx" ON "finance_supply_items" USING btree ("user_id","envelope_id");--> statement-breakpoint
CREATE INDEX "finance_supply_options_item_idx" ON "finance_supply_options" USING btree ("user_id","item_id");--> statement-breakpoint
CREATE INDEX "finance_supply_options_user_asin_idx" ON "finance_supply_options" USING btree ("user_id","asin");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_supply_options_item_in_use_uq" ON "finance_supply_options" USING btree ("user_id","item_id") WHERE "finance_supply_options"."in_use";--> statement-breakpoint
CREATE INDEX "amazon_order_items_user_asin_idx" ON "amazon_order_items" USING btree ("user_id","asin");