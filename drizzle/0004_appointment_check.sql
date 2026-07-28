CREATE TYPE "public"."appointment_check" AS ENUM('open', 'done', 'missed');--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "check_state" "appointment_check" DEFAULT 'open' NOT NULL;--> statement-breakpoint
UPDATE "appointments" SET "check_state" = CASE WHEN "completed" = true THEN 'done'::"appointment_check" ELSE 'open'::"appointment_check" END;--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "completed";
