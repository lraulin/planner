ALTER TABLE "exercises" ADD COLUMN "bodyweight" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "bar_weight" numeric(8, 2) DEFAULT '45' NOT NULL;