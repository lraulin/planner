CREATE TABLE "brain_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_links_not_self" CHECK ("brain_links"."from_id" <> "brain_links"."to_id"),
	CONSTRAINT "brain_links_kind" CHECK ("brain_links"."kind" in ('child', 'jump')),
	CONSTRAINT "brain_links_jump_ordered" CHECK ("brain_links"."kind" <> 'jump' or "brain_links"."from_id" < "brain_links"."to_id")
);
--> statement-breakpoint
CREATE TABLE "brain_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_tags_id_user_uq" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "brain_thought_tags" (
	"user_id" uuid NOT NULL,
	"thought_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "brain_thought_tags_thought_id_tag_id_pk" PRIMARY KEY("thought_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "brain_thought_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_thought_types_id_user_uq" UNIQUE("id","user_id"),
	CONSTRAINT "brain_thought_types_color" CHECK ("brain_thought_types"."color" between 0 and 7)
);
--> statement-breakpoint
CREATE TABLE "brain_thoughts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"type_id" uuid,
	"is_home" boolean DEFAULT false NOT NULL,
	"last_visited_at" timestamp with time zone,
	"external_source" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_thoughts_id_user_uq" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "brain_links" ADD CONSTRAINT "brain_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_links" ADD CONSTRAINT "brain_links_from_user_fk" FOREIGN KEY ("from_id","user_id") REFERENCES "public"."brain_thoughts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_links" ADD CONSTRAINT "brain_links_to_user_fk" FOREIGN KEY ("to_id","user_id") REFERENCES "public"."brain_thoughts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_tags" ADD CONSTRAINT "brain_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_thought_tags" ADD CONSTRAINT "brain_thought_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_thought_tags" ADD CONSTRAINT "brain_thought_tags_thought_user_fk" FOREIGN KEY ("thought_id","user_id") REFERENCES "public"."brain_thoughts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_thought_tags" ADD CONSTRAINT "brain_thought_tags_tag_user_fk" FOREIGN KEY ("tag_id","user_id") REFERENCES "public"."brain_tags"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_thought_types" ADD CONSTRAINT "brain_thought_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_thoughts" ADD CONSTRAINT "brain_thoughts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_thoughts" ADD CONSTRAINT "brain_thoughts_type_user_fk" FOREIGN KEY ("type_id","user_id") REFERENCES "public"."brain_thought_types"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brain_links_pair_uq" ON "brain_links" USING btree ("user_id",least("from_id", "to_id"),greatest("from_id", "to_id"));--> statement-breakpoint
CREATE INDEX "brain_links_user_from_idx" ON "brain_links" USING btree ("user_id","from_id");--> statement-breakpoint
CREATE INDEX "brain_links_user_to_idx" ON "brain_links" USING btree ("user_id","to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_tags_user_name_uq" ON "brain_tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "brain_thought_tags_tag_idx" ON "brain_thought_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_thought_types_user_name_uq" ON "brain_thought_types" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_thoughts_one_home_per_user_uq" ON "brain_thoughts" USING btree ("user_id") WHERE "brain_thoughts"."is_home";--> statement-breakpoint
CREATE INDEX "brain_thoughts_user_visited_idx" ON "brain_thoughts" USING btree ("user_id","last_visited_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "brain_thoughts_external_ref_uq" ON "brain_thoughts" USING btree ("user_id","external_source","external_id") WHERE "brain_thoughts"."external_id" is not null;