import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * The four levels of the Achieve hierarchy. Nesting within a level is unlimited —
 * see `src/lib/tree/hierarchy.ts` for which parent/child pairs are legal.
 */
export const nodeTypeEnum = pgEnum("node_type", [
  "result_area",
  "goal",
  "project",
  "task",
]);

/** ABCD prioritization. A rank may be attached separately, giving "A1", "B2", or bare "A". */
export const priorityLetterEnum = pgEnum("priority_letter", ["A", "B", "C", "D"]);

/**
 * The user-set work state — Achieve's "State" column, which shows "NS" for not started.
 * Distinct from the derived scheduling status ("On Schedule", "Need to Start"), which is
 * computed from effort and deadlines once auto-scheduling exists.
 */
export const nodeStateEnum = pgEnum("node_state", [
  "not_started",
  "in_progress",
  "waiting",
  "completed",
  "cancelled",
  // Achieve's remaining four. Delegated and Should Delegate carry real weight in its weekly
  // review — "who else could do this" is a step of the process, not a synonym for waiting.
  "postponed",
  "delegated",
  "should_delegate",
  "proposed",
]);

/** How often a goal is scored on its Progress tab. */
export const progressReviewEnum = pgEnum("progress_review", [
  "none",
  "daily",
  "weekly",
]);

/** Achieve's task scheduling constraint. Inert until the weekly calendar reads it. */
export const taskConstraintEnum = pgEnum("task_constraint", [
  "as_soon_as_possible",
  "as_late_as_possible",
  "start_no_earlier_than",
  "start_no_later_than",
  "finish_no_earlier_than",
  "finish_no_later_than",
  "must_start_on",
  "must_finish_on",
]);

/** Achieve's project Sensitivity field. Carried for parity; nothing keys off it yet. */
export const sensitivityEnum = pgEnum("sensitivity", [
  "normal",
  "personal",
  "private",
  "confidential",
]);

/**
 * The repeating child lists inside the detail forms. Achieve gives each its own grid, but
 * they share one shape — an ordered list of priority + title + description rows with a few
 * extra columns each — so they share one table. See `node_items`.
 */
export const nodeItemKindEnum = pgEnum("node_item_kind", [
  // Project
  "objective",
  "constraint",
  "strategy",
  "stakeholder",
  "risk",
  "role",
  "contact",
  "issue",
  "attachment",
  // Result area
  "guiding_principle",
  // The four Wish quadrants. Achieve models these as one Wish record with a Type, listed
  // across every result area on its own top-level tab; splitting the type into the
  // discriminator gives the same rows, and that tab becomes a query over these four kinds.
  "wish_want_dont_have",
  "wish_dont_want_have",
  "wish_want_have",
  "wish_want_avoid",
  // Goal
  "benefit",
  "obstacle",
  "action",
  "belief",
  "resource",
  "environment",
  "reward",
  "metric",
  "progress_entry",
  "goal_win",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every item in the hierarchy, of any type. Holds the tree structure plus every field
 * rendered in the Outline grid; fields exclusive to one type live in a detail table below.
 *
 * Sibling order is a lexicographic `sortKey` rather than an integer position, so moving a
 * row rewrites one row instead of renumbering its siblings.
 */
export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => nodes.id, {
      onDelete: "cascade",
    }),
    type: nodeTypeEnum("type").notNull(),
    name: text("name").notNull().default(""),
    sortKey: text("sort_key").notNull(),
    priorityLetter: priorityLetterEnum("priority_letter"),
    priorityRank: smallint("priority_rank"),
    state: nodeStateEnum("state").notNull().default("not_started"),
    deadline: timestamp("deadline", { withTimezone: true }),
    /** Achieve's "Fo" column — a flag used to filter the outline down to current focus. */
    focus: boolean("focus").notNull().default(false),
    collapsed: boolean("collapsed").notNull().default(false),
    notes: text("notes").notNull().default(""),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("nodes_user_parent_sort_idx").on(table.userId, table.parentId, table.sortKey),
    index("nodes_user_type_idx").on(table.userId, table.type),
    // Two siblings may not share a sort key. NULLS NOT DISTINCT so the constraint also
    // covers root nodes, whose parent_id is null.
    unique("nodes_sibling_sort_key_uq")
      .on(table.userId, table.parentId, table.sortKey)
      .nullsNotDistinct(),
  ],
);

/**
 * Task-only fields. Durations are stored in minutes; the UI renders them Achieve-style
 * ("45 min", "2 h", "3:45 h", "3 d"). Parent rows display the rollup of their descendants,
 * computed at read time rather than stored.
 */
export const taskDetails = pgTable("task_details", {
  nodeId: uuid("node_id")
    .primaryKey()
    .references(() => nodes.id, { onDelete: "cascade" }),
  /** Expected effort to complete. */
  effortMinutes: integer("effort_minutes"),
  /** Work still needed. Falls as work is done, but may rise if the estimate was low. */
  effortLeftMinutes: integer("effort_left_minutes"),
  /** Work actually spent so far. */
  actualEffortMinutes: integer("actual_effort_minutes").notNull().default(0),
  percentComplete: smallint("percent_complete").notNull().default(0),
  contexts: text("contexts").array().notNull().default([]),
  // General
  targetStartDate: timestamp("target_start_date", { withTimezone: true }),
  targetEndDate: timestamp("target_end_date", { withTimezone: true }),
  /** When a task is pushed out of view until a date, without losing its deadline. */
  deferredDate: timestamp("deferred_date", { withTimezone: true }),
  leadTimeMinutes: integer("lead_time_minutes"),
  /** Slack Achieve leaves between finishing and the deadline. */
  deadlineLeadTimeMinutes: integer("deadline_lead_time_minutes"),
  source: text("source").notNull().default(""),
  place: text("place").notNull().default(""),
  reminderAt: timestamp("reminder_at", { withTimezone: true }),
  private: boolean("private").notNull().default(false),
  // Schedule
  effortDriven: boolean("effort_driven").notNull().default(true),
  /** A zero-duration marker rather than a piece of work. */
  milestone: boolean("milestone").notNull().default(false),
  actualStartDate: timestamp("actual_start_date", { withTimezone: true }),
  dateCompleted: timestamp("date_completed", { withTimezone: true }),
  /** Wall-clock span the work is spread over, as distinct from effort spent inside it. */
  durationMinutes: integer("duration_minutes"),
  constraint: taskConstraintEnum("constraint").notNull().default("as_soon_as_possible"),
  constraintDate: timestamp("constraint_date", { withTimezone: true }),
  /** Work-breakdown-structure code, e.g. "1.2.3". */
  wbs: text("wbs").notNull().default(""),
  costLow: numeric("cost_low", { precision: 12, scale: 2 }),
  costHigh: numeric("cost_high", { precision: 12, scale: 2 }),
  actualCost: numeric("actual_cost", { precision: 12, scale: 2 }),
  // Details
  billingInformation: text("billing_information").notNull().default(""),
  company: text("company").notNull().default(""),
  mileage: text("mileage").notNull().default(""),
  description: text("description").notNull().default(""),
});

/**
 * Goal-only fields, backing the twelve tabs of Achieve's Goal form.
 *
 * A **Dream is a Goal with `isDream` set**, not a type of its own — Achieve puts a Dream
 * checkbox on this form beside the Range dropdown, and the form is otherwise identical.
 */
export const goalDetails = pgTable("goal_details", {
  nodeId: uuid("node_id")
    .primaryKey()
    .references(() => nodes.id, { onDelete: "cascade" }),
  // General
  isDream: boolean("is_dream").notNull().default(false),
  /**
   * Achieve's Range dropdown — the horizon a goal is set against. Free text rather than an
   * enum: the capture only shows "1-Year", so the full option list is unknown and guessing
   * one would bake a wrong constraint into a migration.
   */
  range: text("range").notNull().default(""),
  plannedStart: timestamp("planned_start", { withTimezone: true }),
  values: text("values").notNull().default(""),
  question: text("question").notNull().default(""),
  affirmation: text("affirmation").notNull().default(""),
  definition: text("definition").notNull().default(""),
  purpose: text("purpose").notNull().default(""),
  contexts: text("contexts").array().notNull().default([]),
  // Vision
  vision: text("vision").notNull().default(""),
  kindOfPerson: text("kind_of_person").notNull().default(""),
  personalChanges: text("personal_changes").notNull().default(""),
  // Obstacles
  baseline: text("baseline").notNull().default(""),
  limitingFactor: text("limiting_factor").notNull().default(""),
  // Strategy
  strategy: text("strategy").notNull().default(""),
  // Progress
  progressReview: progressReviewEnum("progress_review").notNull().default("none"),
  scorecard: boolean("scorecard").notNull().default(false),
});

/**
 * Result-area-only fields. `category` backs the Outline tab's "Group by Category" toggle;
 * whether categories deserve their own entity is still an open question.
 *
 * The prose columns back the Mission / Vision / S.W.O.T tabs of the Result Area form. The
 * form's Notes tab writes to `nodes.notes`, which every type already has.
 */
export const resultAreaDetails = pgTable("result_area_details", {
  nodeId: uuid("node_id")
    .primaryKey()
    .references(() => nodes.id, { onDelete: "cascade" }),
  color: text("color"),
  category: text("category"),
  // General
  description: text("description").notNull().default(""),
  /** Achieve's 0–100 weighting of this area against the others. */
  importance: smallint("importance"),
  reason: text("reason").notNull().default(""),
  // Mission
  mission: text("mission").notNull().default(""),
  // Vision
  idealOuterVision: text("ideal_outer_vision").notNull().default(""),
  idealInnerVision: text("ideal_inner_vision").notNull().default(""),
  // S.W.O.T
  strengths: text("strengths").notNull().default(""),
  weaknesses: text("weaknesses").notNull().default(""),
  opportunities: text("opportunities").notNull().default(""),
  threats: text("threats").notNull().default(""),
});

/**
 * Project-only fields, backing the eleven tabs of Achieve's Project form.
 *
 * Effort, % complete, and the subproject/task counts are absent on purpose: they are
 * rollups of the subtree, computed at read time in `src/lib/tree/derive.ts` and rendered
 * read-only. Recurrence, templates, labels, and resource pools are out of scope.
 */
export const projectDetails = pgTable("project_details", {
  nodeId: uuid("node_id")
    .primaryKey()
    .references(() => nodes.id, { onDelete: "cascade" }),
  // General — scheduling. The weekly calendar will read these; nothing does yet.
  projectStart: timestamp("project_start", { withTimezone: true }),
  targetEnd: timestamp("target_end", { withTimezone: true }),
  /** When set, the schedule stretches to fit the effort rather than the calendar. */
  effortDriven: boolean("effort_driven").notNull().default(true),
  onlyShowNextTask: boolean("only_show_next_task").notNull().default(false),
  /** Slack Achieve leaves before a deadline when auto-scheduling. */
  leadTimeMinutes: integer("lead_time_minutes"),
  /** Preferred length of a single work block on the weekly calendar. */
  blockSizeMinutes: integer("block_size_minutes"),
  timePerWeekMinutes: integer("time_per_week_minutes"),
  recomputeTaskDeadlines: boolean("recompute_task_deadlines").notNull().default(false),
  reminderAt: timestamp("reminder_at", { withTimezone: true }),
  sensitivity: sensitivityEnum("sensitivity").notNull().default("normal"),
  assignedTo: text("assigned_to").notNull().default(""),
  place: text("place").notNull().default(""),
  contexts: text("contexts").array().notNull().default([]),
  // Objectives
  purpose: text("purpose").notNull().default(""),
  // Vision
  idealVision: text("ideal_vision").notNull().default(""),
  sufficientVision: text("sufficient_vision").notNull().default(""),
  // Strategy
  strategy: text("strategy").notNull().default(""),
  // Details
  billingInformation: text("billing_information").notNull().default(""),
  company: text("company").notNull().default(""),
  mileage: text("mileage").notNull().default(""),
  expectedCost: numeric("expected_cost", { precision: 12, scale: 2 }),
  lowCost: numeric("low_cost", { precision: 12, scale: 2 }),
  highCost: numeric("high_cost", { precision: 12, scale: 2 }),
  costToDate: numeric("cost_to_date", { precision: 12, scale: 2 }),
  description: text("description").notNull().default(""),
});

/**
 * Every repeating row inside a detail form, of any kind — objectives, risks, stakeholders,
 * wish-list entries, and the rest. One table rather than fourteen: they all share priority,
 * title, description, and sibling ordering, and differ only in a handful of extra columns.
 * Which columns a kind actually uses is declared in `src/components/detail/itemKinds.ts`.
 *
 * Ordering uses the same lexicographic `sortKey` as the outline, so reordering a row
 * rewrites one row rather than renumbering the list.
 */
export const nodeItems = pgTable(
  "node_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    kind: nodeItemKindEnum("kind").notNull(),
    sortKey: text("sort_key").notNull(),
    priorityLetter: priorityLetterEnum("priority_letter"),
    priorityRank: smallint("priority_rank"),
    /** Also carries an Issue's "Summary" and a Contact's "Name". */
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),

    // Objective
    criteria: text("criteria").notNull().default(""),
    stakeholders: text("stakeholders").notNull().default(""),
    // Stakeholder and Role both classify their rows; the option list comes from the kind
    // config rather than a second enum, since the two vocabularies do not overlap.
    itemType: text("item_type"),
    stake: text("stake").notNull().default(""),
    // Risk
    severity: smallint("severity"),
    probability: smallint("probability"),
    detection: text("detection").notNull().default(""),
    prevention: text("prevention").notNull().default(""),
    mitigation: text("mitigation").notNull().default(""),
    // Candidate strategy
    advantages: text("advantages").notNull().default(""),
    disadvantages: text("disadvantages").notNull().default(""),
    decision: text("decision").notNull().default(""),
    // Role
    idealCandidate: text("ideal_candidate").notNull().default(""),
    candidates: text("candidates").notNull().default(""),
    filled: boolean("filled").notNull().default(false),
    filledBy: text("filled_by").notNull().default(""),
    // Contact
    association: text("association").notNull().default(""),
    contact: text("contact").notNull().default(""),
    // Issue
    source: text("source").notNull().default(""),
    resolution: text("resolution").notNull().default(""),
    resolved: boolean("resolved").notNull().default(false),
    // Attachment
    url: text("url").notNull().default(""),
    // Wish and goal action
    purpose: text("purpose").notNull().default(""),
    // Goal obstacle
    strategy: text("strategy").notNull().default(""),
    people: text("people").notNull().default(""),
    completed: boolean("completed").notNull().default(false),
    // Goal benefit and reward
    received: boolean("received").notNull().default(false),
    conditions: text("conditions").notNull().default(""),
    awarded: boolean("awarded").notNull().default(false),
    // Goal environment/lifestyle
    reason: text("reason").notNull().default(""),
    // Goal metric
    active: boolean("active").notNull().default(true),
    category: text("category").notNull().default(""),
    question: text("question").notNull().default(""),
    target: text("target").notNull().default(""),
    // Goal team
    assignedTo: text("assigned_to").notNull().default(""),
    // Goal progress entry and win — a dated log rather than a titled row
    entryDate: timestamp("entry_date", { withTimezone: true }),
    score: smallint("score"),
    comments: text("comments").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("node_items_owner_list_idx").on(
      table.userId,
      table.nodeId,
      table.kind,
      table.sortKey,
    ),
    // Two rows in the same list may not share a sort key.
    unique("node_items_sibling_sort_key_uq").on(
      table.userId,
      table.nodeId,
      table.kind,
      table.sortKey,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
export type TaskDetails = typeof taskDetails.$inferSelect;
export type ResultAreaDetails = typeof resultAreaDetails.$inferSelect;
export type ProjectDetails = typeof projectDetails.$inferSelect;
export type GoalDetails = typeof goalDetails.$inferSelect;
export type NodeItem = typeof nodeItems.$inferSelect;
export type NewNodeItem = typeof nodeItems.$inferInsert;
export type NodeType = (typeof nodeTypeEnum.enumValues)[number];
export type PriorityLetter = (typeof priorityLetterEnum.enumValues)[number];
export type NodeState = (typeof nodeStateEnum.enumValues)[number];
export type Sensitivity = (typeof sensitivityEnum.enumValues)[number];
export type NodeItemKind = (typeof nodeItemKindEnum.enumValues)[number];
export type ProgressReview = (typeof progressReviewEnum.enumValues)[number];
export type TaskConstraint = (typeof taskConstraintEnum.enumValues)[number];
