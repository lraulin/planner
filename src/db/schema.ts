import {
  boolean,
  index,
  integer,
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
});

/**
 * Result-area-only fields. `category` backs the Outline tab's "Group by Category" toggle;
 * whether categories deserve their own entity is still an open question.
 */
export const resultAreaDetails = pgTable("result_area_details", {
  nodeId: uuid("node_id")
    .primaryKey()
    .references(() => nodes.id, { onDelete: "cascade" }),
  color: text("color"),
  category: text("category"),
});

export type User = typeof users.$inferSelect;
export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
export type TaskDetails = typeof taskDetails.$inferSelect;
export type ResultAreaDetails = typeof resultAreaDetails.$inferSelect;
export type NodeType = (typeof nodeTypeEnum.enumValues)[number];
export type PriorityLetter = (typeof priorityLetterEnum.enumValues)[number];
export type NodeState = (typeof nodeStateEnum.enumValues)[number];
