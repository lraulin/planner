ALTER TABLE "amazon_orders" ADD COLUMN "items_subtotal" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD COLUMN "shipping_handling" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD COLUMN "promotion" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD COLUMN "tax" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD COLUMN "grand_total" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD COLUMN "summary_lines" jsonb;--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD COLUMN "summary_source" text;--> statement-breakpoint
ALTER TABLE "amazon_orders" ADD CONSTRAINT "amazon_orders_summary_source" CHECK ("amazon_orders"."summary_source" is null or "amazon_orders"."summary_source" in ('printed', 'derived'));