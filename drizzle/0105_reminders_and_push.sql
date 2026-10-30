CREATE TYPE "public"."reminder_source_kind" AS ENUM('task', 'project', 'appointment', 'bill', 'ready_to_assign');--> statement-breakpoint
CREATE TYPE "public"."reminder_state" AS ENUM('scheduled', 'fired', 'dismissed', 'completed', 'superseded');--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_kind" "reminder_source_kind" NOT NULL,
	"source_id" uuid NOT NULL,
	"occurrence_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"state" "reminder_state" DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_occurrences_source_uq" ON "reminder_occurrences" USING btree ("user_id","source_kind","source_id","occurrence_key");--> statement-breakpoint
CREATE INDEX "reminder_occurrences_user_state_idx" ON "reminder_occurrences" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "reminder_occurrences_due_idx" ON "reminder_occurrences" USING btree ("fire_at") WHERE "reminder_occurrences"."state" = 'scheduled';