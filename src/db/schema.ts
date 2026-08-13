import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

/**
 * Achieve's two ways of repeating a task (manual §3.9), offered on every frequency.
 *
 * - `scheduled` — a fixed calendar series. The next occurrence is measured from **this
 *   occurrence's own dates**, so completing next week's report on Wednesday buys you until
 *   the week after, and missing one still leaves you owing it.
 * - `regenerate` — measured from **the completion**. Brushing your teeth twice today still
 *   leaves you brushing them tomorrow; mow the lawn on day 1 and the next one is day 8.
 *
 * In Achieve's dialog the Regenerate radio sits alongside the pattern radios and excludes
 * them, which is why `regenerate` always implies `recurrencePattern = "interval"` — a
 * regenerating task has no stable series start for a weekday pattern to hang off.
 */
export const recurrenceModeEnum = pgEnum("recurrence_mode", [
  "scheduled",
  "regenerate",
]);

/**
 * Which calendar pattern a `scheduled` task follows, within its frequency.
 *
 * `interval` is the default and means "step from the anchor by {interval} {frequency}",
 * which is exactly what task recurrence did before patterns existed — so every existing
 * row keeps its behaviour without a data migration.
 *
 * | frequency | patterns |
 * | --- | --- |
 * | daily | `interval` · `weekday` (Mon–Fri) · `weekend` (Sat–Sun) |
 * | weekly | `interval` · `by_weekday` (every N weeks on the ticked days) |
 * | monthly | `interval` · `by_month_day` (day D) · `by_ordinal` (the first…last {weekday}) |
 * | yearly | `interval` · `by_month_day` ({month} {day}) · `by_ordinal` |
 */
export const recurrencePatternEnum = pgEnum("recurrence_pattern", [
  "interval",
  "weekday",
  "weekend",
  "by_weekday",
  "by_month_day",
  "by_ordinal",
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

/**
 * App identity + Better Auth user row (same table).
 * Better Auth maps model `user` → this table via the Drizzle adapter schema config.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The per-user context suggestion catalog.
 *
 * Contexts remain free text on records. This table only owns the curated names offered by
 * autocomplete, matching Achieve's Master Context List: removing a suggestion must never
 * rewrite historical record tags.
 */
export const masterContexts = pgTable(
  "master_contexts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("master_contexts_user_normalized_uq").on(
      table.userId,
      table.normalizedName,
    ),
  ],
);

/** Better Auth sessions (cookie-backed browser login). */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

/**
 * Better Auth linked accounts. Email/password credentials live here
 * (`providerId = "credential"`, `password` holds the hash).
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("accounts_user_idx").on(table.userId)],
);

/** Better Auth email verification / reset tokens (unused in MVP flows, table required). */
export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
    /**
     * Achieve's **Task Chooser priority** — a second, independent ABCD+rank that orders
     * every currently-available task against every other one, the way Franklin Covey's
     * single flat daily list does.
     *
     * Deliberately *not* `priority_letter`. That one is relative to a node's siblings
     * ("the second most important task in this project"); this one is relative to
     * everything you could work on right now ("the second most important thing today"),
     * and the two answers routinely differ. Sharing a column would mean dragging a row in
     * the Task Chooser silently rewrote the outline's sibling ordering.
     *
     * Ranks are dense (1..n within a letter) and maintained by the chooser, not typed
     * free-hand — see `src/lib/chooser/tcPriority.ts`. Null letter means unranked, which
     * is the normal state for a task nobody has triaged yet.
     */
    tcPriorityLetter: priorityLetterEnum("tc_priority_letter"),
    tcPriorityRank: smallint("tc_priority_rank"),
    /**
     * Achieve lifecycle state. Result Areas are enduring roles rather than finite work, so
     * they deliberately store no state; the type-aware CHECK below enforces both halves.
     * Creation code supplies `not_started` explicitly for every stateful node type.
     */
    state: nodeStateEnum("state"),
    deadline: timestamp("deadline", { withTimezone: true }),
    /**
     * The day you intend to do this — **the day plan**, and the single source of truth for
     * which day a task sits on. `src/lib/day/sync.ts` keeps exactly one open `daily_items`
     * line on this date and nowhere else decides it.
     *
     * Not a scheduler output. Achieve's Target Start Date began as one — the date its
     * effort-based engine predicted work would begin — and we have deliberately promoted it
     * to a user input. **If the effort-based scheduler is ever built it must write its own
     * `scheduled_start` / `scheduled_end` and never this column**, or a recompute would
     * silently rewrite the day pages. See `agent-os/standards/product/date-model.md`.
     */
    targetStartDate: timestamp("target_start_date", { withTimezone: true }),
    /** The far end of the planned window. A day-page gesture sets it equal to the start. */
    targetEndDate: timestamp("target_end_date", { withTimezone: true }),
    /**
     * When a `postponed` node comes back on its own — **the expiry of the shelf, not a
     * second hiding mechanism**.
     *
     * Null while postponed means shelved indefinitely, which is Achieve's Postponed (P) and
     * the reason the state exists as well as the date. A date means it stops being
     * postponed when that day arrives; expiry is derived at read time (`src/lib/tree/
     * shelving.ts`), so nothing has to sweep and no clock lives in the database.
     *
     * Set by hand, or moved forward automatically each time a **recurring** task is
     * completed — see `taskDetails.recurrenceFrequency`. A completing recurrence always
     * writes this column, whichever date the pattern is anchored on, because it is the only
     * thing that takes a finished routine out of the Chooser. Without it a deadline-anchored
     * routine could be ticked twice in one day. That is also why a routine reads "P" between
     * cycles: the date implies the state.
     *
     * A shelf and a plan are not in conflict — "back on my radar in February, I intend to
     * start in March, due in April" is the expected shape, which is what the CHECK below
     * permits and why it only forbids the reverse.
     */
    deferredDate: timestamp("deferred_date", { withTimezone: true }),
    /** Achieve's "Fo" column — a flag used to filter the outline down to current focus. */
    focus: boolean("focus").notNull().default(false),
    collapsed: boolean("collapsed").notNull().default(false),
    notes: text("notes").notNull().default(""),
    /**
     * Marks the one project that quick capture drops into — Achieve's `<Inbox>`.
     *
     * A flag rather than a well-known name, because the Inbox is an ordinary project in
     * every other respect: rename it, reprioritise it, complete it, and it keeps working.
     * It can also be deleted, which is how you reset its fields; the next capture makes a
     * fresh one.
     */
    isInbox: boolean("is_inbox").notNull().default(false),
    /**
     * Where this row came from, when it came from outside the app — `"apple_reminders"`
     * for the Shortcut drain. Null on everything a person made here by hand, which is
     * most rows.
     *
     * Deliberately a generic pair rather than an `apple_reminder_id`: the server has no
     * business knowing what Apple Reminders is, and the next source (Raycast, an email
     * drop, a watch) reuses this without a migration.
     */
    externalSource: text("external_source"),
    /**
     * The source's own id for this item, opaque to us. The Reminders Shortcut builds
     * `"<creation date>|<name>"` because the Shortcuts actions do not reliably expose a
     * stable identifier; if a later iOS does, it swaps in with no change here.
     *
     * Its whole job is making an interrupted import safe to re-run. A drain that POSTs
     * successfully and then fails to mark the reminder complete would otherwise duplicate
     * every item on the next run — see `nodes_external_ref_uq`.
     */
    externalId: text("external_id"),
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
    // At most one inbox per user, enforced by the database rather than by whoever
    // remembers to check first.
    uniqueIndex("nodes_one_inbox_per_user_uq")
      .on(table.userId)
      .where(sql`${table.isInbox}`),
    // One row per external item, per user. Scoped by user so two people draining the same
    // shared reminder each get their own node, and partial so the ordinary rows — every
    // one of which has a null external_id — are not all fighting over one key.
    //
    // Capture checks for an existing row before inserting; this index is what makes that
    // check trustworthy rather than a race waiting to happen.
    uniqueIndex("nodes_external_ref_uq")
      .on(table.userId, table.externalSource, table.externalId)
      .where(sql`${table.externalId} is not null`),
    // A plan may not precede availability: you cannot intend to start something on a day
    // before it comes back onto your radar. Equality is legal and is the *normal* case —
    // recurrence sets both to the same date on every cycle. The reverse ordering is the
    // useful one and is deliberately allowed: defer to February, plan for March.
    //
    // This is the reason all four dates live on `nodes` rather than in the detail tables. A
    // CHECK cannot span tables, and while `target_start_date` sat on `task_details` and
    // `deferred_date` beside it, projects could not be shelved at all.
    check(
      "nodes_start_not_before_deferred",
      sql`${table.targetStartDate} is null or ${table.deferredDate} is null or ${table.targetStartDate} >= ${table.deferredDate}`,
    ),
    check(
      "nodes_lifecycle_state_by_type",
      sql`(${table.type} = 'result_area'::node_type and ${table.state} is null and ${table.completedAt} is null and ${table.deferredDate} is null) or (${table.type} <> 'result_area'::node_type and ${table.state} is not null)`,
    ),
  ],
);

/**
 * A lift in the user's exercise catalog (Bench Press, Squat, …). Belongs to the Fitness
 * domain, not the outline hierarchy — so reorganising or deleting plan tasks never wipes
 * training history. See `workout_sessions` / `workout_sets`.
 */
/**
 * How the lift is loaded. Config lives on the catalog exercise; the session log only
 * selects an exercise and adapts set fields. `barbell` uses `barWeight` for plate math;
 * free-weight types (dumbbell, kettlebell, club, mace) record weight; `bodyweight` does not.
 * Unilateral L/R is allowed for those free weights and bodyweight.
 */
export const exerciseEquipmentEnum = pgEnum("exercise_equipment", [
  "barbell",
  "dumbbell",
  "kettlebell",
  "club",
  "mace",
  "bodyweight",
]);

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes").notNull().default(""),
    equipment: exerciseEquipmentEnum("equipment").notNull().default("barbell"),
    /**
     * Bar mass in **lb** for plate calc when equipment is barbell.
     * Olympic 45, EZ ~15, training ~35. Ignored for other equipment.
     */
    barWeight: numeric("bar_weight", { precision: 8, scale: 2 })
      .notNull()
      .default("45"),
    /**
     * Each side separately (dumbbell, kettlebell, club, mace, or bodyweight).
     * Sets store reps_left / reps_right.
     */
    unilateral: boolean("unilateral").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("exercises_user_name_idx").on(table.userId, table.name)],
);

/**
 * Task-only fields. Durations are stored in minutes; the UI renders them Achieve-style
 * ("45 min", "2 h", "3:45 h", "3 d"). Parent rows display the rollup of their descendants,
 * computed at read time rather than stored.
 */
export const taskDetails = pgTable(
  "task_details",
  {
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
    // General. Target start, target end and the deferred date used to live here; they are on
    // `nodes` now, so a project can carry them too and the database can enforce the rule
    // between them. See the comments there.
    leadTimeMinutes: integer("lead_time_minutes"),
    /** Slack Achieve leaves between finishing and the deadline. */
    deadlineLeadTimeMinutes: integer("deadline_lead_time_minutes"),
    source: text("source").notNull().default(""),
    place: text("place").notNull().default(""),
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    private: boolean("private").notNull().default(false),
    // Recurrence
    /**
     * How often this task repeats, and whether it repeats at all — `none` means it does not.
     * Read with `recurrenceInterval`, `recurrenceMode` and `recurrencePattern` as one rule;
     * `src/lib/recurrence/pattern.ts` is where that rule turns into dates.
     *
     * Reuses `recurrence_frequency`, the enum `appointments` already uses, even though the
     * two features are unrelated: an appointment expands one stored master into many
     * calendar occurrences, while a recurring task is a single row that moves its own dates.
     * The shared enum is a convenience — do not unify the code behind them.
     *
     * **Recurrence never _creates_ a deadline; it only moves one you set yourself.** A
     * deadline is an external constraint (taxes, bills); "play with the cats daily" is not
     * one, and modelling routines as deadlines fills Overdue with work that was never
     * urgent, which is what makes Overdue worth reading. A repeating task with no deadline
     * moves only its defer date and can never become Overdue — the load-bearing rule of
     * `agent-os/specs/2026-07-31-0834-task-recurrence/`, still true.
     */
    recurrenceFrequency: recurrenceFrequencyEnum("recurrence_frequency")
      .notNull()
      .default("none"),
    /** How many `recurrenceFrequency` units per step. Floored to 1 by the engine. */
    recurrenceInterval: integer("recurrence_interval").notNull().default(1),
    /** Fixed calendar series, or measured from each completion. See `recurrenceModeEnum`. */
    recurrenceMode: recurrenceModeEnum("recurrence_mode")
      .notNull()
      .default("scheduled"),
    /** The calendar pattern within the frequency. See `recurrencePatternEnum`. */
    recurrencePattern: recurrencePatternEnum("recurrence_pattern")
      .notNull()
      .default("interval"),
    /** Weekly `by_weekday`: which days, 0 = Sunday. Matches `appointments.recurrenceByWeekday`. */
    recurrenceByWeekday: smallint("recurrence_by_weekday").array(),
    /** `by_month_day`: day of the month, 1–31, clamped to the last day of a short month. */
    recurrenceMonthDay: smallint("recurrence_month_day"),
    /** `by_ordinal`: 1–4 for first…fourth, or -1 for last. Achieve's "fifth" does not exist. */
    recurrenceOrdinal: smallint("recurrence_ordinal"),
    /** `by_ordinal`: which weekday, 0 = Sunday. */
    recurrenceWeekday: smallint("recurrence_weekday"),
    /** Yearly patterns: which month, 1–12. */
    recurrenceMonth: smallint("recurrence_month"),
    /** How the series ends. `count` is measured against `task_completions`, not a loop index. */
    recurrenceEnd: recurrenceEndEnum("recurrence_end").notNull().default("never"),
    recurrenceCount: integer("recurrence_count"),
    recurrenceUntil: timestamp("recurrence_until", { withTimezone: true }),
    // Schedule
    effortDriven: boolean("effort_driven").notNull().default(true),
    /** A zero-duration marker rather than a piece of work. */
    milestone: boolean("milestone").notNull().default(false),
    actualStartDate: timestamp("actual_start_date", { withTimezone: true }),
    /**
     * When this task was completed. For a **recurring** task, which never stays completed,
     * this is the *last* completion — the full history is in `task_completions`.
     */
    dateCompleted: timestamp("date_completed", { withTimezone: true }),
    /** Wall-clock span the work is spread over, as distinct from effort spent inside it. */
    durationMinutes: integer("duration_minutes"),
    constraint: taskConstraintEnum("constraint")
      .notNull()
      .default("as_soon_as_possible"),
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
    /**
     * Optional link to a Fitness catalog exercise. Makes this task a **plan reminder** for
     * that lift (e.g. "Bench Press" under a Strength project). History lives on
     * `workout_sessions` / sets, not on the task — so deleting or cancelling the task never
     * erases what you lifted. `set null` if the exercise is removed.
     */
    exerciseId: uuid("exercise_id").references(() => exercises.id, {
      onDelete: "set null",
    }),
    /**
     * The contact this task is a **discussion item** for — Achieve's Contact form Discussion
     * Items grid, whose columns (Priority, Title, Type, Context, Description, Deadline,
     * Resolved) are task fields in everything but name. Modelling them separately would have
     * built a second, worse task list that the Task Chooser and the Day view could not see.
     *
     * Task-only, so it belongs here rather than on `nodes`: a result area does not have a
     * discussion item, and `nodes` is selected whole by `loadOutline` on every render. Same
     * shape as `exerciseId` above, and `set null` for the same reason — deleting the person
     * must never delete the work.
     */
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
  },
  // The recurrence combinations the engine cannot make sense of, refused by the database
  // and not only by the form. `src/lib/recurrence/pattern.ts` is pure and is fed straight
  // from these columns, so an impossible row is a silent wrong answer — and rows arrive
  // from the agent API and from hand-run SQL, not only from the drawer.
  () => [
    // A regenerating task is measured from its completion, so it has no stable series start
    // for a weekday or day-of-month pattern to hang off. Achieve says the same thing by
    // making Regenerate a radio *alongside* the patterns rather than a checkbox beside them.
    check(
      "task_details_regenerate_is_interval",
      sql`recurrence_mode <> 'regenerate' OR recurrence_pattern = 'interval'`,
    ),
    // First…fourth, or last. Achieve's own dialog offers a "fifth" most months do not have.
    check(
      "task_details_ordinal_range",
      sql`recurrence_ordinal IS NULL OR recurrence_ordinal IN (1, 2, 3, 4, -1)`,
    ),
    // "Every 2 weekdays" has no agreed meaning; Achieve reads these as "every weekday".
    check(
      "task_details_weekday_interval_one",
      sql`recurrence_pattern NOT IN ('weekday', 'weekend') OR recurrence_interval = 1`,
    ),
  ],
);

/**
 * One completion of a **recurring** task.
 *
 * A recurring task normally never stays completed — ticking it resets the same row to Not
 * Started and moves its dates on (see `taskDetails.recurrenceFrequency`), so `nodes` holds
 * no record that it was ever done. This table is that record: it answers "how consistent
 * have I been" and "when did I last do X" without leaving a year's worth of completed
 * duplicates in the outline, which is the reason we cycle one row in place rather than
 * copying the node the way Achieve does.
 *
 * It is also the **occurrence counter** for `recurrenceEnd = "count"`: rows here are what
 * "end after N occurrences" is measured against, which is why a phantom completion is a
 * correctness problem and not just noise.
 *
 * Append-only, and written in the same transaction as the reset.
 */
export const taskCompletions = pgTable(
  "task_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("task_completions_user_node_idx").on(
      table.userId,
      table.nodeId,
      table.completedAt,
    ),
  ],
);

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
 * read-only. Templates, labels, and resource pools are out of scope.
 *
 * Recurrence is **tasks-only** for now — it lives on `task_details` for want of a reason to
 * move it, not for want of a `deferredDate`, which projects now have. The blocker this
 * comment used to record is gone; extending recurrence here is its own piece of work.
 *
 * `project_start` and `target_end` used to live here and were `COALESCE`d with the task
 * columns on every read. They are `nodes.targetStartDate` / `nodes.targetEndDate` now — one
 * field per node, as the outline always presented them.
 */
export const projectDetails = pgTable("project_details", {
  nodeId: uuid("node_id")
    .primaryKey()
    .references(() => nodes.id, { onDelete: "cascade" }),
  // General — scheduling. The weekly calendar will read these; nothing does yet.
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
 * Which columns a kind actually uses is declared in `src/lib/detail/itemKinds.ts`.
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
    /**
     * Achieve's Time Chart Information form has Name and Description on its General tab, and
     * the Time Charts list shows both. We had only the name because the chart was reachable
     * solely from the Weekly Schedule's picker, where a description has nowhere to render.
     */
    description: text("description").notNull().default(""),
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
    /**
     * Google Calendar event colour id (`"1"`–`"11"`), or null for the calendar default.
     * Google-owned — mirrored and write-through. See
     * `agent-os/specs/2026-08-10-0937-google-event-colors/`.
     */
    colorId: text("color_id"),
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
    /**
     * Where this row came from — `"google"` for anything mirrored from Google Calendar.
     * Null means the row only ever existed here, which after the sync work is either a
     * pre-Google leftover or a row whose write to Google failed.
     *
     * Google is the source of truth for the columns above `checkState` (including
     * `colorId`); the columns below it (`checkState`, `priority*`, `contexts`, `private`,
     * `projectId`) are ours and the mirror never writes them. See
     * `agent-os/specs/2026-07-31-2046-google-calendar-sync/` and the event-colours delta.
     */
    externalSource: text("external_source"),
    /**
     * Google's event id. For a recurring series this is the *instance* id
     * (`{eventId}_{timestamp}`), because we ask Google to expand series for us and store
     * one row per occurrence rather than a master plus a recurrence rule.
     *
     * Instance ids are stable, which is what lets our local-only annotations survive a
     * re-sync of a recurring event.
     */
    externalId: text("external_id"),
    /**
     * Google's `recurringEventId` — the series this instance belongs to, null for one-offs.
     * We never edit a series here (there is no local master to edit); this exists so the UI
     * can mark an event as recurring and link out to Google to change the series.
     */
    externalSeriesId: text("external_series_id"),
    /** Which Google calendar the event lives on; needed to address it for patch/delete. */
    externalCalendarId: text("external_calendar_id"),
    /** Google's `etag`, so an unchanged event can skip a write. */
    externalEtag: text("external_etag"),
    /** Google's `updated` timestamp, kept for debugging a stale mirror. */
    externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true }),
    /**
     * Inbox leaf that produced this appointment. Kept after the source node is deleted and
     * intentionally has no foreign key: it is an idempotency receipt, not a live relation.
     */
    organizerSourceNodeId: uuid("organizer_source_node_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointments_user_range_idx").on(table.userId, table.startAt, table.endAt),
    index("appointments_user_project_idx").on(table.userId, table.projectId),
    // One row per Google event, per user — the same shape as `nodes_external_ref_uq`.
    // Partial so the rows with no external id (local-only) are not all fighting over one
    // key. This is what makes the mirror's upsert idempotent rather than a race.
    uniqueIndex("appointments_external_ref_uq")
      .on(table.userId, table.externalSource, table.externalId)
      .where(sql`${table.externalId} is not null`),
    uniqueIndex("appointments_organizer_source_uq")
      .on(table.userId, table.organizerSourceNodeId)
      .where(sql`${table.organizerSourceNodeId} is not null`),
  ],
);

/**
 * A Google calendar this user has connected, and whether it is mirrored into
 * `appointments`. Rows are refreshed from Google's `calendarList` when the settings panel
 * is opened; `syncEnabled` is the user's choice and survives that refresh.
 *
 * Sync state rather than UI preference, so a table rather than `user_settings`:
 * `lastSyncedAt` drives the staleness throttle that decides whether loading `/schedule`
 * should hit Google at all.
 */
export const googleCalendarLinks = pgTable(
  "google_calendar_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Google's calendar id — an email-shaped string, or `"primary"`'s resolved id. */
    calendarId: text("calendar_id").notNull(),
    summary: text("summary").notNull().default(""),
    /** Google's colour for the calendar, used to tint its events in the week grid. */
    backgroundColor: text("background_color").notNull().default(""),
    /** Whether events from this calendar are mirrored. Off by default for noisy ones. */
    syncEnabled: boolean("sync_enabled").notNull().default(false),
    /** Google's own `primary` flag — where appointments created here are written. */
    isPrimary: boolean("is_primary").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("google_calendar_links_user_cal_uq").on(table.userId, table.calendarId),
  ],
);

/**
 * Incremental cursor for the user's inbound Google Contacts mirror.
 *
 * The row exists only after the first full sync succeeds; its presence is therefore also
 * the enable flag. This is authoritative integration state rather than a display
 * preference, so it deliberately does not live in `user_settings`.
 */
export const googleContactSyncs = pgTable("google_contact_syncs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Opaque `nextSyncToken` from `people.connections.list`. */
  syncToken: text("sync_token").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    /**
     * The contact this note is filed against — Achieve's Contact form History tab, whose
     * columns (Subject, Type, Context, Start Date, Notes) are a note with a date. A note
     * already has a title, a markdown body, a date, contexts and a flag, so linking beats
     * building a second place to write prose about a person.
     *
     * `set null` like `nodeId`: two independent records that happen to point at each other.
     */
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** Import provenance, currently `tomboy` plus the note file's stable UUID. */
    externalSource: text("external_source"),
    /** Opaque source id used only to make repeated imports update instead of duplicate. */
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notes_user_parent_sort_idx").on(table.userId, table.parentId, table.sortKey),
    index("notes_user_node_idx").on(table.userId, table.nodeId),
    index("notes_user_contact_idx").on(table.userId, table.contactId),
    // Same Tomboy archive can be imported by different users, but one source note may
    // create at most one note per user. Ordinary notes have no external id and opt out.
    uniqueIndex("notes_external_ref_uq")
      .on(table.userId, table.externalSource, table.externalId)
      .where(sql`${table.externalId} is not null`),
    // Same shape as `nodes_sibling_sort_key_uq`: NULLS NOT DISTINCT so the constraint also
    // covers root notes, whose parent_id is null.
    unique("notes_sibling_sort_key_uq")
      .on(table.userId, table.parentId, table.sortKey)
      .nullsNotDistinct(),
  ],
);

export type User = typeof users.$inferSelect;
export type MasterContext = typeof masterContexts.$inferSelect;
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
export type GoogleCalendarLink = typeof googleCalendarLinks.$inferSelect;
export type NewGoogleCalendarLink = typeof googleCalendarLinks.$inferInsert;
/**
 * A row's origin outside this app — see `nodes.externalSource` / `nodes.externalId`.
 *
 * The two travel together on purpose. `nodes_external_ref_uq` indexes both columns, and
 * Postgres counts null sources as distinct from one another, so an id arriving without a
 * source would silently opt out of the uniqueness that makes re-importing safe. Passing
 * one object makes that unrepresentable instead of merely discouraged.
 */
export type ExternalRef = {
  /** The system it came from, e.g. `"apple_reminders"`. */
  source: string;
  /** That system's id for the item. Opaque here — never parsed, only compared. */
  id: string;
};

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
export type RecurrenceMode = (typeof recurrenceModeEnum.enumValues)[number];
export type RecurrencePattern = (typeof recurrencePatternEnum.enumValues)[number];
export type TaskCompletion = typeof taskCompletions.$inferSelect;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type WeeklyPlanEntry = typeof weeklyPlanEntries.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type NoteFlag = (typeof noteFlagEnum.enumValues)[number];

/**
 * One gym visit (or one intentional log entry). Stands alone: no required FK to the
 * outline. Deleting a task/project/goal never touches these rows.
 */
export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** When the training happened (user-chosen; not necessarily createdAt). */
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    title: text("title").notNull().default(""),
    notes: text("notes").notNull().default(""),
    durationMinutes: integer("duration_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workout_sessions_user_performed_idx").on(table.userId, table.performedAt),
  ],
);

/**
 * An exercise performed inside a session, in order. Cascades with the session only —
 * never with outline nodes. The catalog row (`exercises`) is restricted so deleting a
 * used exercise cannot silently orphan or wipe set history.
 */
export const workoutSessionExercises = pgTable(
  "workout_session_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    /** Lexicographic sibling order within the session (same idea as outline sort keys). */
    sortKey: text("sort_key").notNull(),
    notes: text("notes").notNull().default(""),
  },
  (table) => [
    index("workout_session_exercises_session_idx").on(
      table.userId,
      table.sessionId,
      table.sortKey,
    ),
    index("workout_session_exercises_exercise_idx").on(table.userId, table.exerciseId),
  ],
);

/**
 * One set under a session-exercise: reps × weight. Cascades only when that session
 * (or the session-exercise row) is deleted — the intentional "erroneous log" path.
 */
export const workoutSets = pgTable(
  "workout_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => workoutSessionExercises.id, { onDelete: "cascade" }),
    setIndex: integer("set_index").notNull(),
    /** Bilateral reps. Null when the exercise is unilateral (use left/right). */
    reps: integer("reps"),
    /** Unilateral left / right reps when catalog exercise.unilateral is true. */
    repsLeft: integer("reps_left"),
    repsRight: integer("reps_right"),
    weight: numeric("weight", { precision: 10, scale: 2 }),
    unit: text("unit").notNull().default("lb"),
    completed: boolean("completed").notNull().default(true),
  },
  (table) => [
    index("workout_sets_session_exercise_idx").on(
      table.userId,
      table.sessionExerciseId,
      table.setIndex,
    ),
  ],
);

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type WorkoutSessionExercise = typeof workoutSessionExercises.$inferSelect;

/**
 * One line on one day's task list — the Franklin Covey daily list, beside Achieve's own
 * planning. A row here says "I intend to do this on this day". It is **never a deadline**:
 * nothing on a daily list can go overdue, which is the same line the recurrence work drew
 * with `taskDetails.deferredDate` (see the comment there).
 *
 * `nodeId` is nullable, and that is the point. Null means a line jotted straight onto the
 * day — "check oil" — with no parent, no result area, and nothing to triage. Set means a
 * task pulled off the Task Chooser's master list. Both render as the same row, so the
 * habit of writing down today's work never has to pause to classify anything.
 *
 * `title` is always stored: for a jotted line it *is* the item, and for a node-backed one
 * it is a snapshot, so deleting the task later leaves an honest record of the day rather
 * than a blank row. Display prefers the node's live name whenever the node still exists.
 *
 * `day` is a real `date`, not a timestamp — a calendar day has no time component, and
 * storing one would let a server in UTC shift Lee's Tuesday into Monday. `YYYY-MM-DD`
 * strings are already the convention for day comparison across the app
 * (`src/lib/chooser/dates.ts`, `src/lib/tree/status.ts`).
 */
export const dailyItems = pgTable(
  "daily_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The day this line sits on, `YYYY-MM-DD`. */
    day: date("day", { mode: "string" }).notNull(),
    /** The task this line stands for, when it came from the outline. Null when jotted. */
    nodeId: uuid("node_id").references(() => nodes.id, { onDelete: "set null" }),
    title: text("title").notNull().default(""),
    /**
     * The day's own ABC ranking, which answers a different question than either the
     * outline's sibling-relative priority or the chooser's global TC Priority: what is
     * *essential* today (A), what is *important* (B), what is *optional* (C).
     */
    priorityLetter: priorityLetterEnum("priority_letter"),
    priorityRank: smallint("priority_rank"),
    /** Lexicographic order within the day — same fractional indexing as nodes and notes. */
    sortKey: text("sort_key").notNull(),
    /**
     * Achieve's work state, reused so the existing state cell renders these rows with no
     * new vocabulary. It also covers most of Franklin Covey's status marks: In Process →
     * `in_progress`, Delegated → `delegated`, Deleted → `cancelled`.
     */
    state: nodeStateEnum("state").notNull().default("not_started"),
    /**
     * When this line was checked off. **This — not `nodes.state` — decides whether the
     * item was done on this day.** It cannot be derived, because completing a recurring
     * task resets its node to `not_started` (see `applyStateTransition` in
     * `src/lib/tree/mutations.ts`); the day's record has to survive that reset.
     */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /**
     * Franklin Covey's "forwarded" mark: the later day this line was carried to. Set
     * instead of moving the row, so the original day keeps showing what was intended and
     * what actually happened rather than quietly rewriting history.
     */
    forwardedTo: date("forwarded_to", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("daily_items_user_day_sort_idx").on(table.userId, table.day, table.sortKey),
    unique("daily_items_day_sort_key_uq").on(table.userId, table.day, table.sortKey),
    /**
     * A task sits on at most one *open* day. That is what makes "Plan for day" on the task
     * form a single well-defined value, and what makes dragging a task to another day a
     * move rather than a duplicate. Completed and forwarded rows fall out of the index, so
     * a task's history across many days is unconstrained.
     */
    uniqueIndex("daily_items_open_node_uq")
      .on(table.userId, table.nodeId)
      .where(
        sql`${table.nodeId} is not null and ${table.completedAt} is null and ${table.forwardedTo} is null`,
      ),
  ],
);

/**
 * Per-user UI preferences: column layout, filters, sort, sub-view, group collapse, Task
 * Chooser weights. One row per **scope** (`grid:tasks`, `chooser:tc-priority`, …) rather
 * than one blob per user, so a write touches a single row, two open tabs cannot clobber
 * each other through read-modify-write, and one view can be reset without disturbing the
 * rest.
 *
 * This supersedes the `localStorage`-only decision in the frozen `main-grid-tabs` and
 * `task-chooser` specs. What changed is the scope: once *all* view state persists, losing
 * it on a new browser stopped being a fair trade. See
 * `agent-os/specs/2026-07-31-1520-persistent-ui-state/`.
 *
 * `value` is an untyped blob on purpose — each scope owns its own shape and its own
 * defensive parser under `src/lib/settings/`. Nothing here is authoritative data; a
 * corrupt row degrades to defaults rather than to an error.
 */
export const userSettings = pgTable(
  "user_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `grid:{tabId}`, `chooser:{viewId}`, `outline:filters`, `notes:filter`, `display`. */
    scope: text("scope").notNull(),
    /** Scope-specific payload, always carrying a `v` for future migrations. */
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("user_settings_user_idx").on(table.userId),
    unique("user_settings_scope_uq").on(table.userId, table.scope),
  ],
);

/**
 * A measurable quantity the user tracks over time — Achieve's Metrics / Tracking tab.
 *
 * First-class domain (not `node_items`): metrics may be **standalone** (`ownerNodeId`
 * null) or associated with a goal/dream. Deleting the owner sets the link null so
 * tracking history is not cascade-wiped. See
 * `agent-os/specs/2026-08-02-0912-metrics-tab/`.
 */
export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Goal or dream this metric is associated with, when any. Null = stand-alone
     * (Metrics tab without a goal). `set null` on owner delete so history survives.
     */
    ownerNodeId: uuid("owner_node_id").references(() => nodes.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default(""),
    category: text("category").notNull().default(""),
    /** The question the metric answers, e.g. "What is my waist measurement?" */
    question: text("question").notNull().default(""),
    description: text("description").notNull().default(""),
    reason: text("reason").notNull().default(""),
    units: text("units").notNull().default(""),
    active: boolean("active").notNull().default(true),
    priorityLetter: priorityLetterEnum("priority_letter"),
    priorityRank: smallint("priority_rank"),
    /**
     * Achieve tracking type. MVP only uses `"total"` (New Total entries). Stored as text
     * so later types do not need an enum migration.
     */
    metricType: text("metric_type").notNull().default("total"),
    /** Objective target value when set; null means none. */
    objectiveTarget: numeric("objective_target", { precision: 18, scale: 6 }),
    /** Manual order in the Metrics tab list (fractional indexing). */
    sortKey: text("sort_key").notNull(),
    externalSource: text("external_source"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("metrics_user_sort_idx").on(table.userId, table.sortKey),
    index("metrics_user_owner_idx").on(table.userId, table.ownerNodeId),
    unique("metrics_user_sort_key_uq").on(table.userId, table.sortKey),
    uniqueIndex("metrics_external_ref_uq")
      .on(table.userId, table.externalSource, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ],
);

/**
 * One dated measurement for a metric — Achieve's MetricTracking row.
 * Cascades only with the metric itself, never with outline nodes.
 */
export const metricEntries = pgTable(
  "metric_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "cascade" }),
    /** Calendar day of the measurement (date-only string `YYYY-MM-DD`). */
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    /** AP entry type label; MVP default `"new_total"`. */
    entryType: text("entry_type").notNull().default("new_total"),
    /** Target snapshot at the time of entry (often equals objective target). */
    target: numeric("target", { precision: 18, scale: 6 }),
    value: numeric("value", { precision: 18, scale: 6 }).notNull(),
    externalSource: text("external_source"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("metric_entries_metric_date_idx").on(
      table.userId,
      table.metricId,
      table.entryDate,
    ),
    uniqueIndex("metric_entries_external_ref_uq")
      .on(table.userId, table.externalSource, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ],
);

/**
 * The repeating typed sub-records of a contact — Achieve's Contact form Phone Numbers,
 * E-mail, Addresses and Web URLs grids, which are also Google People's `phoneNumbers`,
 * `emailAddresses`, `addresses` and `urls`.
 *
 * One table rather than four, for the reason `node_item_kind` gives about itself: they share
 * one shape — label + value + primary + notes — so they share one table. Addresses add seven
 * part columns that are blank on the others, which is the same sparseness `node_items`
 * already accepts across twenty kinds.
 *
 * The last four are **seeded but unrendered**. People has `relations`, `events`, `imClients`
 * and `userDefined`, and a sync must be able to land them without `ALTER TYPE ... ADD VALUE`
 * on a live enum — a statement that fails outright on Neon's transaction-mode pooler.
 * `user_defined` is also where Achieve's dropped Details fields (Customer Id, Language,
 * Hobbies) would go if they are ever missed.
 */
export const contactItemKindEnum = pgEnum("contact_item_kind", [
  "phone",
  "email",
  "address",
  "url",
  "relation",
  "event",
  "im",
  "user_defined",
]);

/**
 * A person. Achieve's Contacts tab (`Go -> Contacts`, manual §1.3).
 *
 * **Every column here is shaped to Google People API v1**, so the sync that will eventually
 * mirror this table is code rather than a migration. Name parts are stored separately
 * because People stores them separately; the single-line renderings (display name, file-as,
 * initials) are derived in `src/lib/contacts/name.ts` and never written down.
 *
 * **Local-only — a sync must never write or clear these:** `contexts`, and
 * `contact_items.notes`. So are the *inbound* links: `task_details.contact_id` (Achieve's
 * Discussion Items, which are tasks here) and `notes.contact_id` (Contact History, which are
 * notes here).
 *
 * **Two of the six `external_*` columns are placeholders**, carried for shape parity with
 * `appointments` rather than because People has somewhere to put them — see each one.
 *
 * **`notes` ↔ `biographies[0].value` is the one two-way clobber risk**, being both heavily
 * hand-edited and syncable. The rule, decided now while it is cheap: Google wins only when
 * `external_updated_at` is strictly newer than `updated_at`, and never on a blank remote
 * value.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Name — `names[0]`. Achieve's "Title" is People's honorific prefix.
    namePrefix: text("name_prefix").notNull().default(""),
    givenName: text("given_name").notNull().default(""),
    middleName: text("middle_name").notNull().default(""),
    familyName: text("family_name").notNull().default(""),
    nameSuffix: text("name_suffix").notNull().default(""),
    /** `nicknames[type=DEFAULT].value`. */
    nickname: text("nickname").notNull().default(""),
    /** Achieve's Initials field ↔ `nicknames[type=INITIALS]`. Blank means derive. */
    initials: text("initials").notNull().default(""),
    /** Sort-name override ↔ `fileAses[0].value`. Blank means derive. */
    fileAs: text("file_as").notNull().default(""),

    // Organization — `organizations[0]`.
    company: text("company").notNull().default(""),
    jobTitle: text("job_title").notNull().default(""),
    /**
     * Dropped from Achieve's Details tab, kept anyway: `organizations[].department` is a
     * first-class People field and the point of this table is that a sync needs no
     * migration. Not on the drawer's first screen.
     */
    department: text("department").notNull().default(""),

    /**
     * People models these as repeated `relations[type=manager|assistant]`, where `.person`
     * is a **name string, not a link**. Achieve shows one field each and so do we; a sync
     * writes the first match here and must not delete the others.
     */
    managerName: text("manager_name").notNull().default(""),
    assistantName: text("assistant_name").notNull().default(""),

    /**
     * Achieve's Group field ↔ `memberships[].contactGroupMembership`. A name, not a
     * resource id — mapping the two needs a `contactGroups.list` call the sync will own.
     */
    groupName: text("group_name").notNull().default(""),

    /**
     * `birthdays[0].date`. Three columns rather than a `date` because People's `year` is
     * genuinely optional and routinely unknown, which a date column cannot express.
     */
    birthdayYear: smallint("birthday_year"),
    birthdayMonth: smallint("birthday_month"),
    birthdayDay: smallint("birthday_day"),

    /** `photos[0].url`. Output-only there — mirror it, never write it. */
    photoUrl: text("photo_url").notNull().default(""),

    /** `biographies[0].value` (TEXT_PLAIN). See the clobber rule above. */
    notes: text("notes").notNull().default(""),
    /** Ours alone. People has no home for it. */
    contexts: text("contexts").array().notNull().default([]),

    externalSource: text("external_source"),
    /** People's `resourceName`, e.g. `people/c123…`. Opaque; never parsed. */
    externalId: text("external_id"),
    /** **No People analogue.** Carried for shape parity with `appointments`. */
    externalSeriesId: text("external_series_id"),
    /** Repurposed: which People collection — `connections` vs `otherContacts`. */
    externalCalendarId: text("external_calendar_id"),
    /** The Person `etag`, so an unchanged contact can skip a write. */
    externalEtag: text("external_etag"),
    externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contacts_user_name_idx").on(table.userId, table.familyName, table.givenName),
    index("contacts_user_company_idx").on(table.userId, table.company),
    // Same partial shape as `appointments_external_ref_uq`: local-only rows must not all
    // fight over one key, and the mirror's upsert has to be idempotent rather than a race.
    uniqueIndex("contacts_external_ref_uq")
      .on(table.userId, table.externalSource, table.externalId)
      .where(sql`${table.externalId} is not null`),
    // A day without a month is not a date. Month+day with no year is the common case, and
    // People permits a year on its own, so only the day is tied to the month.
    check(
      "contacts_birthday_month_day_together",
      sql`(${table.birthdayMonth} is null) = (${table.birthdayDay} is null)`,
    ),
    check(
      "contacts_birthday_ranges",
      sql`(${table.birthdayMonth} is null or ${table.birthdayMonth} between 1 and 12)
          and (${table.birthdayDay} is null or ${table.birthdayDay} between 1 and 31)
          and (${table.birthdayYear} is null or ${table.birthdayYear} between 1000 and 9999)`,
    ),
  ],
);

/**
 * One phone number, e-mail address, postal address or URL belonging to a contact.
 *
 * No `external_*` columns: People's sub-fields have **no stable identifier**, so a sync
 * cannot address one. It must reconcile by `(kind, normalised value)` and carry `notes` and
 * `sort_key` forward from the matched local row, inserting and deleting only the difference.
 * The obvious implementation — delete the contact's phones, insert Google's — silently eats
 * the local-only `notes` on every row, which is why the rule is written here rather than
 * left to be invented later.
 */
export const contactItems = pgTable(
  "contact_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: contactItemKindEnum("kind").notNull(),
    /** Order within the kind. People's array order is meaningful; this preserves it. */
    sortKey: text("sort_key").notNull(),

    /**
     * People's `type` — "home", "work", "mobile", or anything the user typed. Text, not an
     * enum: People allows custom types and returns them verbatim. The suggestion list lives
     * in `src/lib/contacts/itemKinds.ts`.
     */
    label: text("label").notNull().default(""),
    /**
     * The single-line value: the number, the address, the URL. On an `address` row this is
     * People's `formattedValue`, with the parts below it.
     */
    value: text("value").notNull().default(""),
    /** Achieve's E-mail "Display As" ↔ `emailAddresses[].displayName`. */
    displayName: text("display_name").notNull().default(""),
    /** People's `metadata.primary`. At most one per (contact, kind) — enforced below. */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** Achieve's per-row Notes. **No People analogue — local-only.** */
    notes: text("notes").notNull().default(""),

    // Address parts (`addresses[]`); blank on every other kind.
    streetAddress: text("street_address").notNull().default(""),
    extendedAddress: text("extended_address").notNull().default(""),
    poBox: text("po_box").notNull().default(""),
    city: text("city").notNull().default(""),
    /** Achieve's "State". */
    region: text("region").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    country: text("country").notNull().default(""),
    countryCode: text("country_code").notNull().default(""),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contact_items_owner_list_idx").on(
      table.userId,
      table.contactId,
      table.kind,
      table.sortKey,
    ),
    unique("contact_items_sibling_sort_key_uq").on(
      table.userId,
      table.contactId,
      table.kind,
      table.sortKey,
    ),
    // One primary per kind, as a fact the database holds rather than an invariant whoever
    // writes the next mutation has to remember. Without it the grid can show one phone
    // while the drawer shows another, and nothing anywhere is wrong enough to notice.
    uniqueIndex("contact_items_primary_uq")
      .on(table.userId, table.contactId, table.kind)
      .where(sql`${table.isPrimary}`),
  ],
);

/**
 * A person or pool of working capacity — Achieve's Resources list.
 *
 * The planner currently uses a resource only as a reusable default for a week's time budget;
 * it does not schedule individual projects or tasks around resource assignments yet. The full
 * AP field set belongs here now so that later scheduling work needs an algorithm, not another
 * migration. `availableMinutes` is deliberately *not* stored: it is a derived answer from
 * the seven day inputs, overhead and effectiveness (`src/lib/resources/capacity.ts`).
 */
export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Achieve recommends a compact scheduling name, e.g. "Lee" or "Design team". */
    shortName: text("short_name").notNull().default(""),
    description: text("description").notNull().default(""),
    /** The person behind this capacity, if there is one. Deleting them keeps the resource. */
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** Percent of working time lost to email, meetings and administrative work. */
    overheadPercent: numeric("overhead_percent", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    /** Capacity relative to an average team member; 100% is the neutral default. */
    effectivenessPercent: numeric("effectiveness_percent", { precision: 7, scale: 2 })
      .notNull()
      .default("100"),
    /** Working minutes on each weekday, rather than hours, so partial days stay exact. */
    mondayMinutes: integer("monday_minutes").notNull().default(0),
    tuesdayMinutes: integer("tuesday_minutes").notNull().default(0),
    wednesdayMinutes: integer("wednesday_minutes").notNull().default(0),
    thursdayMinutes: integer("thursday_minutes").notNull().default(0),
    fridayMinutes: integer("friday_minutes").notNull().default(0),
    saturdayMinutes: integer("saturday_minutes").notNull().default(0),
    sundayMinutes: integer("sunday_minutes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("resources_user_short_name_idx").on(table.userId, table.shortName),
    index("resources_user_contact_idx").on(table.userId, table.contactId),
    check(
      "resources_percent_ranges",
      sql`${table.overheadPercent} between 0 and 100
          and ${table.effectivenessPercent} >= 0`,
    ),
    check(
      "resources_day_minutes_nonnegative",
      sql`${table.mondayMinutes} >= 0 and ${table.tuesdayMinutes} >= 0
          and ${table.wednesdayMinutes} >= 0 and ${table.thursdayMinutes} >= 0
          and ${table.fridayMinutes} >= 0 and ${table.saturdayMinutes} >= 0
          and ${table.sundayMinutes} >= 0`,
    ),
  ],
);

/**
 * What kind of account a finance account is. The sign convention does not branch on this —
 * positive is always money into the account — so this drives labelling and, later, whether
 * a balance reads as an asset or a debt.
 *
 * Seeded with the full set up front rather than grown later: `ALTER TYPE ... ADD VALUE`
 * fails outright on Neon's transaction-mode pooler, the same reason `contact_item_kind`
 * carries values nothing renders yet.
 */
export const financeAccountKindEnum = pgEnum("finance_account_kind", [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "other",
]);

/**
 * What a transaction *does*, as opposed to what it was spent on.
 *
 * This exists because summing negative amounts does not measure spending. Moving $500 from
 * checking to savings is two rows and zero spend; paying a credit card is a second negative
 * for money the card already recorded as spent. Reporting that does not know the difference
 * overstates outflow by six figures on this data set.
 *
 * `internal_transfer` is money between accounts we hold — both legs are dropped from spend.
 * `external_transfer` is money moved to somewhere outside the module (a PayPal balance),
 * where only one leg will ever exist; it is not spending, but it is not neutral either.
 * `interest_fee` is separated from `spend` because it is the cost of the accounts
 * themselves and is worth its own number.
 *
 * Seeded complete for the same pooler reason as `finance_account_kind` above.
 */
export const financeFlowKindEnum = pgEnum("finance_flow_kind", [
  "spend",
  "income",
  "internal_transfer",
  "external_transfer",
  "refund",
  "interest_fee",
]);

/**
 * One account a transaction feed lands in — a bank account, a card, later whatever Plaid
 * calls an item.
 *
 * **`externalSource` + `externalKey` are the identity the importer matches on**, not the
 * name. `externalKey` is whatever the feed can supply stably: a card's last four from the
 * `Card No.` column, a bank's `Account Number`, later a Plaid account id. `name` is yours to
 * change and the importer never touches it after creating the row, so renaming an account
 * cannot orphan its history.
 *
 * A feed is a string rather than an enum precisely because adding one must not be a
 * migration — see the pooler note on `finance_account_kind`.
 */
export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Display name. Seeded from the file on first import, then owned by the user. */
    name: text("name").notNull(),
    kind: financeAccountKindEnum("kind").notNull().default("other"),
    /** Free text — "Chase", "Capital One". Display only; identity lives in the key. */
    institution: text("institution").notNull().default(""),
    /** The feed that created this account: `csv:chase-credit`, later `plaid`. */
    externalSource: text("external_source").notNull(),
    /** Stable per-feed account identifier — last four, account number, Plaid id. */
    externalKey: text("external_key").notNull(),
    /** Set when the account stops being live. Rows stay; the register can hide them. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("finance_accounts_external_uq").on(
      table.userId,
      table.externalSource,
      table.externalKey,
    ),
    index("finance_accounts_user_name_idx").on(table.userId, table.name),
  ],
);

/**
 * One posted transaction.
 *
 * **Sign convention: positive is money into the account.** A card purchase is negative and a
 * payment to that card positive; a deposit is positive and a withdrawal negative. Chase
 * already exports this way; the Capital One formats are normalised onto it at parse time
 * (`src/lib/finances/formats.ts`). One rule for every account kind means sums and balances
 * never branch — a credit card is simply a liability whose balance runs negative.
 *
 * **`externalId` is a dedup fingerprint, not a bank-supplied id** — none of these CSV feeds
 * supply one. It hashes account, both dates, description, signed amount, **and an
 * occurrence ordinal**; see `src/lib/finances/fingerprint.ts`. The ordinal is what keeps two
 * byte-identical rows in one file (the real Capital One export has a pair) from collapsing
 * into one, while still letting a re-import of that same file recognise both. The partial
 * unique index below makes the database the arbiter, so a double-submitted upload cannot
 * duplicate rows even if the caller miscounts.
 *
 * The running `balanceAfter` and the bank's `sourceCategory` are deliberately **outside**
 * the fingerprint: banks restate balances and recategorise merchants, and neither should
 * make an already-imported transaction look new.
 *
 * **Import never updates an existing row** — it inserts or skips. That is what makes the
 * user-owned `category` and `notes` durable across re-imports without a merge policy.
 */
export const financeTransactions = pgTable(
  "finance_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "cascade" }),
    /** Calendar day the transaction happened (date-only string `YYYY-MM-DD`). */
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    /** Calendar day it posted. Absent in some feeds; falls back to the transaction date. */
    postedDate: date("posted_date", { mode: "string" }),
    description: text("description").notNull(),
    /** Signed; positive is money into the account. */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    /** What the bank called it. Never overwritten by a later import, never user-edited. */
    sourceCategory: text("source_category").notNull().default(""),
    /** Yours. Null means uncategorised — distinct from the bank's blank string. */
    category: text("category"),
    notes: text("notes").notNull().default(""),
    /** Running balance where the feed supplies one (the 360 exports do; cards do not). */
    balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }),
    /**
     * What the classifier worked out this row is spent on. **Recomputable** — wiping the
     * column and re-running the rules must be a no-op, which is what makes "Reclassify" a
     * button rather than a migration. The user's `category` above overrides it.
     */
    derivedCategory: text("derived_category"),
    /** Classifier's flow. Recomputable on the same terms as `derivedCategory`. */
    derivedFlow: financeFlowKindEnum("derived_flow"),
    /** The user disagreeing with `derivedFlow`. Wins, and survives every reclassify. */
    flowOverride: financeFlowKindEnum("flow_override"),
    /**
     * Shared by both rows of one movement between accounts — the withdrawal and the deposit
     * carry the same id.
     *
     * A boolean would say "this is a transfer" without saying *which* row is its other half,
     * and the pairing is the whole point: it is what lets reporting drop both legs without
     * also dropping a legitimate purchase that happens to match an unrelated amount. Null
     * where no counterpart exists — a leg can be classified `internal_transfer` and still be
     * unpaired, which is the normal case for card payments predating that card's import.
     */
    transferGroupId: uuid("transfer_group_id"),
    /**
     * Keep this row out of the baseline burn rate. The wedding and the house move are real
     * money that says nothing about what next month costs; averaging them in answers a
     * question nobody asked. Never set by the classifier — only suggested, then confirmed.
     */
    excludeFromBaseline: boolean("exclude_from_baseline").notNull().default(false),
    /** Names the one-off — "Wedding", "House move" — so it totals as an event, not a blip. */
    eventLabel: text("event_label").notNull().default(""),
    externalSource: text("external_source"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("finance_transactions_account_date_idx").on(
      table.userId,
      table.accountId,
      table.transactionDate,
    ),
    index("finance_transactions_user_date_idx").on(table.userId, table.transactionDate),
    uniqueIndex("finance_transactions_external_ref_uq")
      .on(table.userId, table.externalSource, table.externalId)
      .where(sql`${table.externalId} is not null`),
    // Finding the other leg of a transfer, and the reclassify pass that rebuilds them.
    index("finance_transactions_transfer_group_idx")
      .on(table.userId, table.transferGroupId)
      .where(sql`${table.transferGroupId} is not null`),
    // Every dashboard rollup filters by flow and then by date window, in that order.
    index("finance_transactions_flow_date_idx").on(
      table.userId,
      table.derivedFlow,
      table.transactionDate,
    ),
  ],
);

/**
 * One official monthly statement for an account — the bookend a later reconcile compares
 * the register against.
 *
 * Separate from `finance_transactions` because a statement is not a money movement. It is
 * the bank's summary of a billing period (opening, closing, due date, credit line, APR).
 * CSV imports have no statement; 360 PDFs fill opening/closing only; Chase card PDFs fill
 * the rest.
 *
 * **Money that is a ledger total uses the module sign** (positive = money into the
 * account). A card's printed New Balance of $239.34 is stored as `-239.34`, so
 * `opening + sum(rows) = closing` is the same check for bank and card. Amounts that are
 * facts rather than ledger direction — minimum payment, credit line, YTD fees — stay
 * non-negative as printed.
 *
 * Import inserts or skips. There is no user-editable field, so a re-import of the same
 * period is a no-op rather than a merge.
 */
export const financeStatements = pgTable(
  "finance_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financeAccounts.id, { onDelete: "cascade" }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    statementDate: date("statement_date", { mode: "string" }),
    /** Module sign. */
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull(),
    /** Module sign. Card New Balance is negative. */
    closingBalance: numeric("closing_balance", { precision: 14, scale: 2 }).notNull(),
    paymentDueDate: date("payment_due_date", { mode: "string" }),
    minimumPayment: numeric("minimum_payment", { precision: 14, scale: 2 }),
    pastDueAmount: numeric("past_due_amount", { precision: 14, scale: 2 }),
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }),
    availableCredit: numeric("available_credit", { precision: 14, scale: 2 }),
    /** Module sign. */
    paymentsCredits: numeric("payments_credits", { precision: 14, scale: 2 }),
    purchases: numeric("purchases", { precision: 14, scale: 2 }),
    cashAdvances: numeric("cash_advances", { precision: 14, scale: 2 }),
    balanceTransfers: numeric("balance_transfers", { precision: 14, scale: 2 }),
    feesCharged: numeric("fees_charged", { precision: 14, scale: 2 }),
    interestCharged: numeric("interest_charged", { precision: 14, scale: 2 }),
    ytdFees: numeric("ytd_fees", { precision: 14, scale: 2 }),
    ytdInterest: numeric("ytd_interest", { precision: 14, scale: 2 }),
    rewardsPoints: integer("rewards_points"),
    externalSource: text("external_source"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("finance_statements_period_uq").on(
      table.userId,
      table.accountId,
      table.periodStart,
      table.periodEnd,
    ),
    uniqueIndex("finance_statements_external_ref_uq")
      .on(table.userId, table.externalSource, table.externalId)
      .where(sql`${table.externalId} is not null`),
    index("finance_statements_account_end_idx").on(
      table.userId,
      table.accountId,
      table.periodEnd,
    ),
  ],
);

/**
 * APR / interest row on a credit-card statement. A cycle can have more than one purchase
 * rate ("Purchases prior to 07/09/2025" plus "Purchases"), so these are not columns.
 */
export const financeStatementRates = pgTable(
  "finance_statement_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => financeStatements.id, { onDelete: "cascade" }),
    /** "Purchases", "Cash Advances", "Balance Transfers", or a dated variant. */
    balanceType: text("balance_type").notNull(),
    aprPercent: numeric("apr_percent", { precision: 6, scale: 3 }).notNull(),
    balanceSubject: numeric("balance_subject", { precision: 14, scale: 2 }),
    /** Module sign. Card interest is negative. */
    interestCharged: numeric("interest_charged", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("finance_statement_rates_statement_idx").on(table.userId, table.statementId),
  ],
);

export type DailyItem = typeof dailyItems.$inferSelect;
export type NewDailyItem = typeof dailyItems.$inferInsert;
export type WorkoutSet = typeof workoutSets.$inferSelect;
export type UserSetting = typeof userSettings.$inferSelect;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type MetricEntry = typeof metricEntries.$inferSelect;
export type NewMetricEntry = typeof metricEntries.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactItem = typeof contactItems.$inferSelect;
export type NewContactItem = typeof contactItems.$inferInsert;
export type ContactItemKind = (typeof contactItemKindEnum.enumValues)[number];
export type GoogleContactSync = typeof googleContactSyncs.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type FinanceAccount = typeof financeAccounts.$inferSelect;
export type NewFinanceAccount = typeof financeAccounts.$inferInsert;
export type FinanceAccountKind = (typeof financeAccountKindEnum.enumValues)[number];
export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type NewFinanceTransaction = typeof financeTransactions.$inferInsert;
export type FinanceFlowKind = (typeof financeFlowKindEnum.enumValues)[number];
export type FinanceStatement = typeof financeStatements.$inferSelect;
export type NewFinanceStatement = typeof financeStatements.$inferInsert;
export type FinanceStatementRate = typeof financeStatementRates.$inferSelect;
export type NewFinanceStatementRate = typeof financeStatementRates.$inferInsert;
