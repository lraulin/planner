CREATE TYPE "public"."recurrence_mode" AS ENUM('scheduled', 'regenerate');--> statement-breakpoint
CREATE TYPE "public"."recurrence_pattern" AS ENUM('interval', 'weekday', 'weekend', 'by_weekday', 'by_month_day', 'by_ordinal');--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_mode" "recurrence_mode" DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_pattern" "recurrence_pattern" DEFAULT 'interval' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_by_weekday" smallint[];--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_month_day" smallint;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_ordinal" smallint;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_weekday" smallint;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_month" smallint;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_end" "recurrence_end" DEFAULT 'never' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_count" integer;--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "recurrence_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_details" ADD CONSTRAINT "task_details_regenerate_is_interval" CHECK (recurrence_mode <> 'regenerate' OR recurrence_pattern = 'interval');--> statement-breakpoint
ALTER TABLE "task_details" ADD CONSTRAINT "task_details_ordinal_range" CHECK (recurrence_ordinal IS NULL OR recurrence_ordinal IN (1, 2, 3, 4, -1));--> statement-breakpoint
ALTER TABLE "task_details" ADD CONSTRAINT "task_details_weekday_interval_one" CHECK (recurrence_pattern NOT IN ('weekday', 'weekend') OR recurrence_interval = 1);