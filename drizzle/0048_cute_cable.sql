ALTER TABLE "task_details" DROP CONSTRAINT "task_details_exercise_id_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "task_details" DROP COLUMN "exercise_id";