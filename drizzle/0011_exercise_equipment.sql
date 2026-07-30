CREATE TYPE "public"."exercise_equipment" AS ENUM('barbell', 'dumbbell', 'bodyweight');--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "equipment" "exercise_equipment" DEFAULT 'barbell' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "unilateral" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "exercises" SET "equipment" = 'bodyweight' WHERE "bodyweight" = true;--> statement-breakpoint
UPDATE "exercises" SET "equipment" = 'dumbbell' WHERE "bodyweight" = false AND "bar_weight"::numeric = 0;--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "bodyweight";--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "reps_left" integer;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "reps_right" integer;