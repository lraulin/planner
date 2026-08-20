CREATE TYPE "public"."exercise_measure" AS ENUM('reps', 'time', 'reps_and_time');--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "measure" "exercise_measure" DEFAULT 'reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_duration_positive" CHECK ("workout_sets"."duration_seconds" is null or "workout_sets"."duration_seconds" > 0);