CREATE TABLE "workout_session_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"rest_seconds" integer,
	CONSTRAINT "workout_session_groups_rest_positive" CHECK ("workout_session_groups"."rest_seconds" is null or "workout_session_groups"."rest_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_session_groups" ADD CONSTRAINT "workout_session_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_groups" ADD CONSTRAINT "workout_session_groups_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_session_groups_session_idx" ON "workout_session_groups" USING btree ("user_id","session_id");--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_group_id_workout_session_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."workout_session_groups"("id") ON DELETE set null ON UPDATE no action;