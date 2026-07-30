CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_session_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sort_key" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"duration_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"reps" integer,
	"weight" numeric(10, 2),
	"unit" text DEFAULT 'lb' NOT NULL,
	"completed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_details" ADD COLUMN "exercise_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_exercise_id_workout_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."workout_session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_user_name_idx" ON "exercises" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "workout_session_exercises_session_idx" ON "workout_session_exercises" USING btree ("user_id","session_id","sort_key");--> statement-breakpoint
CREATE INDEX "workout_session_exercises_exercise_idx" ON "workout_session_exercises" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_performed_idx" ON "workout_sessions" USING btree ("user_id","performed_at");--> statement-breakpoint
CREATE INDEX "workout_sets_session_exercise_idx" ON "workout_sets" USING btree ("user_id","session_exercise_id","set_index");--> statement-breakpoint
ALTER TABLE "task_details" ADD CONSTRAINT "task_details_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;