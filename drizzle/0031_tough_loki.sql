CREATE TABLE "master_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "organizer_source_node_id" uuid;--> statement-breakpoint
ALTER TABLE "master_contexts" ADD CONSTRAINT "master_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "master_contexts_user_normalized_uq" ON "master_contexts" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_organizer_source_uq" ON "appointments" USING btree ("user_id","organizer_source_node_id") WHERE "appointments"."organizer_source_node_id" is not null;--> statement-breakpoint
WITH observed AS (
	SELECT n.user_id, btrim(context_name) AS name
	FROM task_details d
	JOIN nodes n ON n.id = d.node_id
	CROSS JOIN LATERAL unnest(d.contexts) AS context_name
	UNION ALL
	SELECT n.user_id, btrim(context_name)
	FROM project_details d
	JOIN nodes n ON n.id = d.node_id
	CROSS JOIN LATERAL unnest(d.contexts) AS context_name
	UNION ALL
	SELECT n.user_id, btrim(context_name)
	FROM goal_details d
	JOIN nodes n ON n.id = d.node_id
	CROSS JOIN LATERAL unnest(d.contexts) AS context_name
	UNION ALL
	SELECT a.user_id, btrim(context_name)
	FROM appointments a
	CROSS JOIN LATERAL unnest(a.contexts) AS context_name
	UNION ALL
	SELECT no.user_id, btrim(context_name)
	FROM notes no
	CROSS JOIN LATERAL unnest(no.contexts) AS context_name
	UNION ALL
	SELECT c.user_id, btrim(context_name)
	FROM contacts c
	CROSS JOIN LATERAL unnest(c.contexts) AS context_name
), catalog AS (
	SELECT user_id, min(name) AS name, lower(name) AS normalized_name
	FROM observed
	WHERE name <> ''
	GROUP BY user_id, lower(name)
)
INSERT INTO master_contexts (user_id, name, normalized_name)
SELECT user_id, name, normalized_name
FROM catalog;
