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

/** Free/busy style for appointments — named for later Google Calendar mapping. */
export const showAsEnum = pgEnum("show_as", [
  "busy",
  "free",
  "tentative",
  "out_of_office",
]);

/**
 * Achieve's three-state checkbox on calendar appointments:
 * empty (open) → checked (done) → X (missed) → empty.
 * Does not yet feed Actual Effort; that waits on the time-tracking track.
 */
export const appointmentCheckEnum = pgEnum("appointment_check", [
  "open",
  "done",
  "missed",
]);

/** How an appointment repeats. `none` is a single instance. */
export const recurrenceFrequencyEnum = pgEnum("recurrence_frequency", [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
]);

/** How a recurring series ends. */
export const recurrenceEndEnum = pgEnum("recurrence_end", ["never", "count", "until"]);

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

/**
 * Achieve's colour flag on a note — the "Flag" column and its dropdown. `done` is Achieve's
 * one non-colour entry; the rest are pure colours with no meaning attached, which is the
 * point of them.
 */
export const noteFlagEnum = pgEnum("note_flag", [
  "none",
  "done",
  "blue",
  "cyan",
  "green",
  "orange",
  "purple",
  "red",
  "yellow",
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
   * Achieve's Range dropdown — the horizon a goal is set against, stored as its label
   * ("Week" through "Lifetime"; the list lives in `GoalForm.tsx`).
   *
   * Free text rather than an enum, so adding a horizon is a one-line change to that list
   * rather than a migration, and a value written before the list was known still loads.
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

/**
 * A named weekly template (Achieve's "Time Chart") — e.g. "Ideal Week". Areas on the
 * chart paint the background of the Weekly Schedule; they are not appointments.
 */
export const timeCharts = pgTable(
  "time_charts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("time_charts_user_idx").on(table.userId)],
);

/**
 * One block on a Time Chart. `daysOfWeek` is 0=Sunday … 6=Saturday (JS getDay()).
 * Multi-day is intentional — one row can cover Mon–Fri without Ctrl+drag duplicates.
 *
 * Times are minutes from midnight (0–1439 start; duration may span past midnight for
 * overnight blocks like Sleep).
 */
export const timeChartAreas = pgTable(
  "time_chart_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    timeChartId: uuid("time_chart_id")
      .notNull()
      .references(() => timeCharts.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    resultAreaId: uuid("result_area_id").references(() => nodes.id, {
      onDelete: "set null",
    }),
    /** 0=Sun … 6=Sat. Empty array is treated as no days (hidden). */
    daysOfWeek: smallint("days_of_week").array().notNull().default([]),
    startMinute: integer("start_minute").notNull().default(0),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    labelEnabled: boolean("label_enabled").notNull().default(true),
    foreColor: text("fore_color").notNull().default("#1b1d23"),
    backColor: text("back_color").notNull().default("#c8e0f0"),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("time_chart_areas_chart_idx").on(table.userId, table.timeChartId)],
);

/**
 * A real calendar event — free-floating or linked to a project. Recurrence fields are
 * stored on the series master; occurrences for a visible week are expanded in pure code
 * rather than materialised as rows.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    location: text("location").notNull().default(""),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    /**
     * Three-state checkbox: open / done / missed. Replaces Achieve's tri-state
     * control; not yet linked to project Actual Effort.
     */
    checkState: appointmentCheckEnum("check_state").notNull().default("open"),
    /** Minutes before start; null = no reminder. */
    reminderMinutes: integer("reminder_minutes"),
    showAs: showAsEnum("show_as").notNull().default("busy"),
    priorityLetter: priorityLetterEnum("priority_letter"),
    priorityRank: smallint("priority_rank"),
    projectId: uuid("project_id").references(() => nodes.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    contexts: text("contexts").array().notNull().default([]),
    private: boolean("private").notNull().default(false),
    recurrenceFrequency: recurrenceFrequencyEnum("recurrence_frequency")
      .notNull()
      .default("none"),
    recurrenceInterval: integer("recurrence_interval").notNull().default(1),
    /** For weekly recurrence: 0=Sun … 6=Sat. Null/empty → use start_at's weekday. */
    recurrenceByWeekday: smallint("recurrence_by_weekday").array(),
    recurrenceEnd: recurrenceEndEnum("recurrence_end").notNull().default("never"),
    recurrenceCount: integer("recurrence_count"),
    recurrenceUntil: timestamp("recurrence_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointments_user_range_idx").on(table.userId, table.startAt, table.endAt),
    index("appointments_user_project_idx").on(table.userId, table.projectId),
  ],
);

/**
 * One run of the weekly planning wizard — Achieve's Weekly Planning Wizard, minus its
 * per-resource loop (resource pools are out of scope; see the spec).
 *
 * There is at most one plan per week, so re-entering the wizard resumes rather than
 * starting over. `weekStart` is stored already normalized to `weekStartsOn`.
 */
export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Local midnight of the first day of the planned week. */
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    /** 0=Sun … 6=Sat. Achieve's "Start week on". */
    weekStartsOn: smallint("week_starts_on").notNull().default(0),
    /** Achieve's "Perform Result Area & Goal Review" — whether steps 1–2 are in this run. */
    reviewAreasGoals: boolean("review_areas_goals").notNull().default(true),
    /** The week's time budget for project work, in minutes. */
    availableMinutes: integer("available_minutes"),
    timeChartId: uuid("time_chart_id").references(() => timeCharts.id, {
      onDelete: "set null",
    }),
    /** Default size of a block dropped in step 5. */
    blockSizeMinutes: integer("block_size_minutes").notNull().default(90),
    avoidCollisions: boolean("avoid_collisions").notNull().default(true),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("weekly_plans_user_week_uq").on(table.userId, table.weekStart)],
);

/**
 * What one plan decided about one node. A result area row carries `focus`, a goal row a
 * `rewrite`, a project row `committedMinutes` — one shape rather than a table per step,
 * the same call the `node_items` table makes.
 *
 * Rewrites are deliberately per-plan rather than written back onto the goal: restating a
 * goal each week is the exercise, and last week's wording is what makes it reviewable.
 */
export const weeklyPlanEntries = pgTable(
  "weekly_plan_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    /** Result area marked a focus area for this week. Mirrors `nodes.focus` at plan time. */
    focus: boolean("focus").notNull().default(false),
    reviewed: boolean("reviewed").notNull().default(false),
    rewrite: text("rewrite").notNull().default(""),
    committedMinutes: integer("committed_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("weekly_plan_entries_plan_idx").on(table.userId, table.planId),
    unique("weekly_plan_entries_plan_node_uq").on(table.planId, table.nodeId),
  ],
);

/**
 * A note. Notes nest under each other but are **not** part of the Result Area → Goal →
 * Project → Task hierarchy: they carry no priority, effort, or state, so a fifth
 * `node_type` would have leaked into every keep-filter and rollup in the app for rows that
 * cannot answer any of those questions. Own table, same lexicographic `sortKey` ordering.
 *
 * `body` is markdown source, stored as written. Nothing renders it server-side.
 *
 * `nodeId` is the optional link to a record — a note kept against a project. It is
 * `set null` rather than `cascade`: deleting a project must not silently take the notes
 * written about it.
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => notes.id, {
      onDelete: "cascade",
    }),
    sortKey: text("sort_key").notNull(),
    title: text("title").notNull().default(""),
    /** Achieve's Subject column — a free-text bucket, defaulting to "General". */
    subject: text("subject").notNull().default(""),
    /** Markdown source. */
    body: text("body").notNull().default(""),
    /** Achieve's Date column: the date the note is *about*, not when it was written. */
    noteDate: timestamp("note_date", { withTimezone: true }),
    flag: noteFlagEnum("flag").notNull().default("none"),
    contexts: text("contexts").array().notNull().default([]),
    collapsed: boolean("collapsed").notNull().default(false),
    nodeId: uuid("node_id").references(() => nodes.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notes_user_parent_sort_idx").on(table.userId, table.parentId, table.sortKey),
    index("notes_user_node_idx").on(table.userId, table.nodeId),
    // Same shape as `nodes_sibling_sort_key_uq`: NULLS NOT DISTINCT so the constraint also
    // covers root notes, whose parent_id is null.
    unique("notes_sibling_sort_key_uq")
      .on(table.userId, table.parentId, table.sortKey)
      .nullsNotDistinct(),
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
export type TimeChart = typeof timeCharts.$inferSelect;
export type TimeChartArea = typeof timeChartAreas.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type NodeType = (typeof nodeTypeEnum.enumValues)[number];
export type PriorityLetter = (typeof priorityLetterEnum.enumValues)[number];
export type NodeState = (typeof nodeStateEnum.enumValues)[number];
export type Sensitivity = (typeof sensitivityEnum.enumValues)[number];
export type NodeItemKind = (typeof nodeItemKindEnum.enumValues)[number];
export type ProgressReview = (typeof progressReviewEnum.enumValues)[number];
export type TaskConstraint = (typeof taskConstraintEnum.enumValues)[number];
export type ShowAs = (typeof showAsEnum.enumValues)[number];
export type AppointmentCheck = (typeof appointmentCheckEnum.enumValues)[number];
export type RecurrenceFrequency = (typeof recurrenceFrequencyEnum.enumValues)[number];
export type RecurrenceEnd = (typeof recurrenceEndEnum.enumValues)[number];
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type WeeklyPlanEntry = typeof weeklyPlanEntries.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type NoteFlag = (typeof noteFlagEnum.enumValues)[number];
