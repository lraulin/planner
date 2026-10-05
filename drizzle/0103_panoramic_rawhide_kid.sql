CREATE TABLE "finance_scenario_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"sort_key" text NOT NULL,
	"name" text NOT NULL,
	"amount_cents" integer,
	"cadence_unit" text,
	"cadence_n" smallint,
	"supply_item_id" uuid,
	"supply_group_id" uuid,
	"envelope_id" uuid,
	"budget_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_scenario_lines_id_scenario_kind_uq" UNIQUE("id","scenario_id","kind"),
	CONSTRAINT "finance_scenario_lines_name_present" CHECK (length(trim("finance_scenario_lines"."name")) > 0),
	CONSTRAINT "finance_scenario_lines_kind" CHECK ("finance_scenario_lines"."kind" in ('income', 'expense')),
	CONSTRAINT "finance_scenario_lines_sources" CHECK ((
            "finance_scenario_lines"."amount_cents" is not null and "finance_scenario_lines"."amount_cents" >= 0
            and "finance_scenario_lines"."cadence_unit" in ('month', 'day')
            and "finance_scenario_lines"."cadence_n" is not null and "finance_scenario_lines"."cadence_n" >= 1 and "finance_scenario_lines"."cadence_n" <= 200
            and "finance_scenario_lines"."supply_item_id" is null and "finance_scenario_lines"."supply_group_id" is null
          ) or (
            "finance_scenario_lines"."amount_cents" is null and "finance_scenario_lines"."cadence_unit" is null and "finance_scenario_lines"."cadence_n" is null
            and (("finance_scenario_lines"."supply_item_id" is not null)::int + ("finance_scenario_lines"."supply_group_id" is not null)::int) <= 1
          )),
	CONSTRAINT "finance_scenario_lines_one_actuals_link" CHECK ("finance_scenario_lines"."envelope_id" is null or "finance_scenario_lines"."budget_group_id" is null)
);
--> statement-breakpoint
CREATE TABLE "finance_scenario_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"envelope_id" uuid NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"monthly_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_scenario_overrides_scenario_envelope_uq" UNIQUE("scenario_id","envelope_id"),
	CONSTRAINT "finance_scenario_overrides_monthly_nonneg" CHECK ("finance_scenario_overrides"."monthly_cents" is null or "finance_scenario_overrides"."monthly_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "finance_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_scenarios_id_user_uq" UNIQUE("id","user_id"),
	CONSTRAINT "finance_scenarios_name_present" CHECK (length(trim("finance_scenarios"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "finance_scenario_lines" ADD CONSTRAINT "finance_scenario_lines_supply_item_id_finance_supply_items_id_fk" FOREIGN KEY ("supply_item_id") REFERENCES "public"."finance_supply_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenario_lines" ADD CONSTRAINT "finance_scenario_lines_supply_group_id_finance_supply_groups_id_fk" FOREIGN KEY ("supply_group_id") REFERENCES "public"."finance_supply_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenario_lines" ADD CONSTRAINT "finance_scenario_lines_envelope_id_finance_budget_categories_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenario_lines" ADD CONSTRAINT "finance_scenario_lines_budget_group_id_finance_category_groups_id_fk" FOREIGN KEY ("budget_group_id") REFERENCES "public"."finance_category_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenario_lines" ADD CONSTRAINT "finance_scenario_lines_scenario_user_fk" FOREIGN KEY ("scenario_id","user_id") REFERENCES "public"."finance_scenarios"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenario_lines" ADD CONSTRAINT "finance_scenario_lines_parent_fk" FOREIGN KEY ("parent_id","scenario_id","kind") REFERENCES "public"."finance_scenario_lines"("id","scenario_id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenario_overrides" ADD CONSTRAINT "finance_scenario_overrides_envelope_id_finance_budget_categories_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."finance_budget_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenario_overrides" ADD CONSTRAINT "finance_scenario_overrides_scenario_user_fk" FOREIGN KEY ("scenario_id","user_id") REFERENCES "public"."finance_scenarios"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_scenarios" ADD CONSTRAINT "finance_scenarios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_scenario_lines_scenario_idx" ON "finance_scenario_lines" USING btree ("user_id","scenario_id","parent_id","sort_key");--> statement-breakpoint
CREATE INDEX "finance_scenario_lines_supply_item_idx" ON "finance_scenario_lines" USING btree ("supply_item_id");--> statement-breakpoint
CREATE INDEX "finance_scenario_lines_supply_group_idx" ON "finance_scenario_lines" USING btree ("supply_group_id");--> statement-breakpoint
CREATE INDEX "finance_scenarios_user_sort_idx" ON "finance_scenarios" USING btree ("user_id","sort_key");