import { z } from "zod";
import {
  nodeStateEnum,
  nodeTypeEnum,
  noteFlagEnum,
  priorityLetterEnum,
} from "@/db/schema";
import {
  GOAL_KEYS,
  PROJECT_KEYS,
  RESULT_AREA_KEYS,
  TASK_KEYS,
} from "@/lib/detail/mutations";

const id = z.uuid().describe("Planner UUID returned by a prior tool call.");
const isoDate = z.string().describe("ISO-8601 date or timestamp string.");
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Calendar date in YYYY-MM-DD form.");
const nullableIsoDate = isoDate.nullable();
const nullableId = id.nullable();
const nodeType = z.enum(nodeTypeEnum.enumValues);
const nodeState = z.enum(nodeStateEnum.enumValues);
const priorityLetter = z.enum(priorityLetterEnum.enumValues).nullable();
const strings = z.array(z.string());

const MONEY_KEYS = new Set([
  "expectedCost",
  "lowCost",
  "highCost",
  "costToDate",
  "costLow",
  "costHigh",
  "actualCost",
]);
const DATE_KEYS = new Set([
  "reminderAt",
  "plannedStart",
  "constraintDate",
  "recurrenceUntil",
  "actualStartDate",
  "dateCompleted",
]);
const BOOLEAN_KEYS = new Set([
  "effortDriven",
  "onlyShowNextTask",
  "recomputeTaskDeadlines",
  "isDream",
  "scorecard",
  "private",
  "milestone",
]);
const NUMBER_KEYS = new Set([
  "importance",
  "leadTimeMinutes",
  "blockSizeMinutes",
  "timePerWeekMinutes",
  "effortMinutes",
  "effortLeftMinutes",
  "actualEffortMinutes",
  "percentComplete",
  "recurrenceInterval",
  "recurrenceMonthDay",
  "recurrenceOrdinal",
  "recurrenceWeekday",
  "recurrenceMonth",
  "recurrenceCount",
  "deadlineLeadTimeMinutes",
  "durationMinutes",
]);
const ARRAY_KEYS = new Set(["contexts"]);
const NUMBER_ARRAY_KEYS = new Set(["recurrenceByWeekday"]);

const ENUMS: Record<string, readonly [string, ...string[]]> = {
  sensitivity: ["normal", "personal", "private", "confidential"],
  progressReview: ["none", "daily", "weekly"],
  recurrenceFrequency: ["none", "daily", "weekly", "monthly", "yearly"],
  recurrenceMode: ["scheduled", "regenerate"],
  recurrencePattern: [
    "interval",
    "weekday",
    "weekend",
    "by_weekday",
    "by_month_day",
    "by_ordinal",
  ],
  recurrenceEnd: ["never", "count", "until"],
  constraint: [
    "as_soon_as_possible",
    "as_late_as_possible",
    "start_no_earlier_than",
    "start_no_later_than",
    "finish_no_earlier_than",
    "finish_no_later_than",
    "must_start_on",
    "must_finish_on",
  ],
};

function sideField(key: string): z.ZodType {
  if (MONEY_KEYS.has(key)) return z.union([z.number(), z.string()]).nullable();
  if (DATE_KEYS.has(key)) return nullableIsoDate;
  if (BOOLEAN_KEYS.has(key)) return z.boolean();
  if (NUMBER_KEYS.has(key)) return z.number().finite().nullable();
  if (ARRAY_KEYS.has(key)) return strings;
  if (NUMBER_ARRAY_KEYS.has(key)) return z.array(z.number().int()).nullable();
  if (ENUMS[key]) return z.enum(ENUMS[key]);
  return z.string().nullable();
}

function sideSchema(keys: readonly string[]) {
  return z.strictObject(
    Object.fromEntries(keys.map((key) => [key, sideField(key).optional()])),
  );
}

const resultAreaFields = sideSchema(RESULT_AREA_KEYS);
const goalFields = sideSchema(GOAL_KEYS);
const projectFields = sideSchema(PROJECT_KEYS);
const taskFields = sideSchema(TASK_KEYS);

const externalOptionalFields = {
  externalSource: z
    .string()
    .min(1)
    .optional()
    .describe("Stable namespace for an external natural key; pair with externalId."),
  externalId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque id in externalSource; pair with externalSource for safe retries.",
    ),
};

function retryableObject(fields: Record<string, z.ZodType>) {
  return z.union([
    z.strictObject(fields),
    z.strictObject({
      ...fields,
      externalSource: z
        .string()
        .min(1)
        .describe("Stable namespace for this external natural key."),
      externalId: z
        .string()
        .min(1)
        .describe(
          "Opaque id within externalSource; makes a retry return the existing row.",
        ),
    }),
  ]);
}

const nodePatchFields = {
  name: z.string().optional(),
  notes: z.string().optional(),
  priorityLetter: priorityLetter.optional(),
  priorityRank: z.number().int().nullable().optional(),
  state: nodeState.optional(),
  deadline: nullableIsoDate.optional(),
  targetStartDate: nullableIsoDate.optional(),
  targetEndDate: nullableIsoDate.optional(),
  deferredDate: nullableIsoDate.optional(),
  focus: z.boolean().optional(),
  effortMinutes: z.number().finite().nullable().optional(),
  resultArea: resultAreaFields.optional(),
  goal: goalFields.optional(),
  project: projectFields.optional(),
  task: taskFields.optional(),
};

const pageInputFields = {
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(200).default(50),
};

export const pageInfoSchema = z.strictObject({
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
  returned: z.number().int().min(0),
  total: z.number().int().min(0),
  hasMore: z.boolean(),
  nextOffset: z.number().int().min(0).nullable(),
});

export const nodeSummarySchema = z.strictObject({
  id,
  parentId: nullableId,
  type: nodeType,
  name: z.string(),
  state: nodeState.nullable(),
  priorityLetter,
  priorityRank: z.number().int().nullable(),
  deadline: nullableIsoDate,
  focus: z.boolean(),
  depth: z.number().int().min(0),
  effortMinutes: z.number().nullable(),
  effortLeftMinutes: z.number().nullable(),
  path: z.string(),
});

const nodeDetailSchema = nodeSummarySchema.extend({
  notes: z.string(),
  targetStartDate: nullableIsoDate,
  targetEndDate: nullableIsoDate,
  deferredDate: nullableIsoDate,
  resultArea: resultAreaFields.nullable(),
  goal: goalFields.nullable(),
  project: projectFields.nullable(),
  task: taskFields.nullable(),
  linkedNotes: z.array(
    z.strictObject({
      id,
      title: z.string(),
      noteDate: nullableIsoDate,
      snippet: z.string(),
    }),
  ),
});

const noteSchema = z.strictObject({
  id,
  parentId: nullableId,
  title: z.string(),
  subject: z.string(),
  body: z.string(),
  noteDate: nullableIsoDate,
  flag: z.enum(noteFlagEnum.enumValues),
  contexts: strings,
  nodeId: nullableId,
  depth: z.number().int().min(0),
});

const noteSearchSchema = noteSchema
  .omit({ body: true })
  .extend({ snippet: z.string() });

const metricEntrySchema = z.strictObject({
  id,
  metricId: id,
  entryDate: dateKey,
  value: z.number(),
  target: z.number().nullable(),
  entryType: z.string(),
});

const metricSummaryFields = {
  id,
  title: z.string(),
  category: z.string(),
  question: z.string(),
  units: z.string(),
  active: z.boolean(),
  metricType: z.enum(["instance", "cumulative", "total"]),
  objectiveTarget: z.number().nullable(),
  ownerNodeId: nullableId,
  ownerName: z.string().nullable(),
  priorityLetter,
  priorityRank: z.number().int().nullable(),
  lastValue: z.number().nullable(),
  lastDate: dateKey.nullable(),
};
const metricSummarySchema = z.strictObject(metricSummaryFields);
const metricDetailSchema = z.strictObject({
  ...metricSummaryFields,
  description: z.string(),
  reason: z.string(),
  entries: z.array(metricEntrySchema.omit({ metricId: true })),
  entryCount: z.number().int().min(0),
  entryPageInfo: pageInfoSchema,
});

const planEntrySchema = z.strictObject({
  id,
  planId: id,
  nodeId: id,
  focus: z.boolean(),
  reviewed: z.boolean(),
  rewrite: z.string(),
  committedMinutes: z.number().nullable(),
});

const compactPlanSchema = z.strictObject({
  id,
  weekStart: isoDate,
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  reviewAreasGoals: z.boolean().optional(),
  availableMinutes: z.number().nullable(),
  timeChartId: nullableId,
  blockSizeMinutes: z.number().optional(),
  avoidCollisions: z.boolean().optional(),
  completedAt: nullableIsoDate,
});

const appointmentSchema = z.strictObject({
  id,
  subject: z.string(),
  startAt: isoDate,
  endAt: isoDate,
  projectId: nullableId,
  checkState: z.enum(["open", "done", "missed"]),
});

const occurrenceSchema = z.strictObject({
  id: z.string(),
  occurrenceKey: z.string(),
  subject: z.string(),
  startAt: isoDate,
  endAt: isoDate,
  projectId: nullableId,
  checkState: z.enum(["open", "done", "missed"]).optional(),
});

const noteInputFields = {
  title: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  nodeId: nullableId.optional(),
  noteDate: nullableIsoDate.optional(),
  flag: z.enum(noteFlagEnum.enumValues).optional(),
  contexts: strings.optional(),
};

const metricInputFields = {
  title: z.string().optional(),
  category: z.string().optional(),
  question: z.string().optional(),
  description: z.string().optional(),
  reason: z.string().optional(),
  units: z.string().optional(),
  active: z.boolean().optional(),
  metricType: z.enum(["instance", "cumulative", "total"]).optional(),
  priorityLetter: priorityLetter.optional(),
  priorityRank: z.number().int().nullable().optional(),
  objectiveTarget: z.number().finite().nullable().optional(),
  ownerNodeId: nullableId.optional(),
};

const captureItemSchema = z.strictObject({
  name: z.string().min(1),
  note: z.string().optional(),
  deadline: nullableIsoDate.optional(),
  externalSource: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
});

const captureInputSchema = z.union([
  z.strictObject({
    name: z.string().min(1),
    note: z.string().optional(),
    deadline: nullableIsoDate.optional(),
    ...externalOptionalFields,
  }),
  z.strictObject({
    externalSource: z.string().min(1).optional(),
    items: z.array(captureItemSchema).min(1).max(100),
  }),
]);

const captureResultSchema = z.strictObject({
  nodeId: id,
  created: z.boolean(),
  externalId: z.string().optional(),
});

export const inputSchemas = {
  health: z.strictObject({}),
  list_tools: z.strictObject({
    domain: z
      .enum(["core", "outline", "notes", "schedule", "planning", "metrics", "all"])
      .default("core"),
    includeLegacy: z.boolean().default(false),
  }),
  describe_tool: z.strictObject({ name: z.string().min(1) }),
  get_context: z.strictObject({
    weekStartsOn: z.number().int().min(0).max(6).default(0),
    topOpenWorkLimit: z.number().int().min(1).max(100).default(25),
  }),
  search_nodes: z.strictObject({
    type: z.union([nodeType, z.array(nodeType).min(1)]).optional(),
    state: z.union([nodeState, z.array(nodeState).min(1)]).optional(),
    focus: z.boolean().optional(),
    query: z.string().optional(),
    parentId: nullableId.optional(),
    includeCompleted: z.boolean().default(false),
    ...pageInputFields,
  }),
  get_node: z.strictObject({ id }),
  create_node: retryableObject({
    type: nodeType,
    parentId: nullableId.optional(),
    ...nodePatchFields,
  }),
  capture_inbox: captureInputSchema,
  capture: captureInputSchema,
  update_node: z.strictObject({ id, ...nodePatchFields }),
  create_note: retryableObject(noteInputFields),
  update_note: z.strictObject({ id, ...noteInputFields }),
  search_notes: z.strictObject({
    query: z.string().optional(),
    nodeId: id.optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  get_note: z.strictObject({ id }),
  list_notes: z.strictObject({
    nodeId: id.optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  get_week: z.strictObject({
    weekStart: isoDate.optional(),
    weekStartsOn: z.number().int().min(0).max(6).default(0),
  }),
  create_appointment: z.strictObject({
    subject: z.string().optional(),
    startAt: isoDate,
    endAt: isoDate,
    location: z.string().optional(),
    allDay: z.boolean().optional(),
    projectId: nullableId.optional(),
    notes: z.string().optional(),
    contexts: strings.optional(),
  }),
  update_appointment: z.strictObject({
    id,
    subject: z.string().optional(),
    startAt: isoDate.optional(),
    endAt: isoDate.optional(),
    location: z.string().optional(),
    allDay: z.boolean().optional(),
    projectId: nullableId.optional(),
    notes: z.string().optional(),
    checkState: z.enum(["open", "done", "missed"]).optional(),
  }),
  delete_appointment: z.strictObject({ id }),
  ensure_weekly_plan: z.strictObject({
    weekStart: isoDate.optional(),
    weekStartsOn: z.number().int().min(0).max(6).default(0),
    reviewAreasGoals: z.boolean().optional(),
  }),
  update_weekly_plan: z.strictObject({
    id,
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    reviewAreasGoals: z.boolean().optional(),
    availableMinutes: z.number().min(0).nullable().optional(),
    timeChartId: nullableId.optional(),
    blockSizeMinutes: z.number().min(5).optional(),
    avoidCollisions: z.boolean().optional(),
  }),
  upsert_plan_entry: z.strictObject({
    planId: id,
    nodeId: id,
    focus: z.boolean().optional(),
    reviewed: z.boolean().optional(),
    rewrite: z.string().optional(),
    committedMinutes: z.number().min(0).nullable().optional(),
  }),
  update_weekly_plan_entries: z.strictObject({
    planId: id,
    entries: z
      .array(
        z.strictObject({
          nodeId: id,
          focus: z.boolean().optional(),
          reviewed: z.boolean().optional(),
          rewrite: z.string().optional(),
          committedMinutes: z.number().min(0).nullable().optional(),
        }),
      )
      .min(1)
      .max(100),
  }),
  set_focus_area: z.strictObject({ planId: id, nodeId: id, focus: z.boolean() }),
  load_weekly_plan: z.strictObject({
    weekStart: isoDate.optional(),
    weekStartsOn: z.number().int().min(0).max(6).default(0),
  }),
  set_weekly_plan_completed: z.strictObject({ id, completed: z.boolean() }),
  list_metrics: z.strictObject({
    activeOnly: z.boolean().default(false),
    query: z.string().optional(),
    ownerNodeId: nullableId.optional(),
    ...pageInputFields,
  }),
  get_metric: z.strictObject({
    id,
    entryOffset: z.number().int().min(0).default(0),
    entryLimit: z.number().int().min(1).max(200).default(30),
  }),
  create_metric: retryableObject(metricInputFields),
  update_metric: z.strictObject({ id, ...metricInputFields }),
  log_metric_entry: retryableObject({
    metricId: id,
    value: z.number().finite(),
    entryDate: dateKey.optional(),
    target: z.number().finite().nullable().optional(),
    entryType: z.string().optional(),
  }),
  update_metric_entry: z.strictObject({
    id,
    value: z.number().finite().optional(),
    entryDate: dateKey.optional(),
    target: z.number().finite().nullable().optional(),
    entryType: z.string().optional(),
  }),
} as const;

const healthOutput = z.strictObject({
  status: z.literal("ok"),
  tools: z.array(z.string()),
  contractVersion: z.literal(2),
  discovery: z.strictObject({
    listTools: z.literal("list_tools"),
    describeTool: z.literal("describe_tool"),
  }),
});

const toolEffectsSchema = z.strictObject({
  kind: z.enum(["read", "write"]),
  destructive: z.boolean(),
  retry: z.enum(["safe", "safe_with_external_ref", "unsafe"]),
  confirmation: z.enum(["none", "user_intent", "explicit"]),
});
const toolListItemSchema = z.strictObject({
  name: z.string(),
  domain: z.string(),
  summary: z.string(),
  effects: toolEffectsSchema,
  exposure: z.enum(["core", "domain", "legacy"]),
  replacedBy: z.string().optional(),
});

const captureOutput = z.union([
  z.strictObject({
    node: nodeDetailSchema,
    parentId: id,
    created: z.boolean(),
    createdIds: z.array(id),
  }),
  z.strictObject({
    parentId: id,
    created: z.number().int().min(0),
    skipped: z.number().int().min(0),
    results: z.array(captureResultSchema),
  }),
]);

export const outputSchemas = {
  health: healthOutput,
  list_tools: z.strictObject({ tools: z.array(toolListItemSchema) }),
  describe_tool: z.strictObject({
    tool: toolListItemSchema.extend({
      description: z.strictObject({
        what: z.string(),
        useWhen: z.string(),
        avoidWhen: z.string(),
        returns: z.string(),
      }),
      inputSchema: z.json(),
      outputSchema: z.json(),
      examples: z.array(z.strictObject({ title: z.string(), arguments: z.json() })),
    }),
  }),
  get_context: z.strictObject({
    asOf: isoDate,
    weekStart: dateKey,
    focus: z.array(nodeSummarySchema),
    topOpenWork: z.array(nodeSummarySchema),
    topOpenWorkInfo: z.strictObject({
      returned: z.number().int().min(0),
      total: z.number().int().min(0),
      hasMore: z.boolean(),
    }),
    weeklyPlan: compactPlanSchema
      .pick({
        id: true,
        weekStart: true,
        completedAt: true,
        availableMinutes: true,
        timeChartId: true,
      })
      .nullable(),
    weekAppointmentCount: z.number().int().min(0),
  }),
  search_nodes: z.strictObject({
    nodes: z.array(nodeSummarySchema),
    pageInfo: pageInfoSchema,
  }),
  get_node: z.strictObject({ node: nodeDetailSchema }),
  create_node: z.strictObject({ node: nodeDetailSchema, created: z.boolean() }),
  capture_inbox: captureOutput,
  capture: captureOutput,
  update_node: z.strictObject({ node: nodeDetailSchema }),
  create_note: z.strictObject({ note: noteSchema, created: z.boolean() }),
  update_note: z.strictObject({ note: noteSchema }),
  search_notes: z.strictObject({
    notes: z.array(noteSearchSchema),
    pageInfo: pageInfoSchema,
  }),
  get_note: z.strictObject({ note: noteSchema }),
  list_notes: z.strictObject({ notes: z.array(noteSchema), pageInfo: pageInfoSchema }),
  get_week: z.strictObject({
    weekStart: dateKey,
    weekStartsOn: z.number().int().min(0).max(6),
    plan: compactPlanSchema
      .pick({
        id: true,
        completedAt: true,
        availableMinutes: true,
        timeChartId: true,
        blockSizeMinutes: true,
        avoidCollisions: true,
      })
      .nullable(),
    appointments: z.array(
      appointmentSchema.extend({ allDay: z.boolean(), location: z.string() }),
    ),
    occurrences: z.array(occurrenceSchema),
  }),
  create_appointment: z.strictObject({ appointment: appointmentSchema }),
  update_appointment: z.strictObject({ appointment: appointmentSchema }),
  delete_appointment: z.strictObject({ deleted: z.literal(true), id }),
  ensure_weekly_plan: z.strictObject({
    plan: compactPlanSchema.pick({
      id: true,
      weekStart: true,
      weekStartsOn: true,
      reviewAreasGoals: true,
      availableMinutes: true,
      timeChartId: true,
      completedAt: true,
    }),
  }),
  update_weekly_plan: z.strictObject({
    plan: compactPlanSchema.pick({
      id: true,
      weekStart: true,
      availableMinutes: true,
      timeChartId: true,
      blockSizeMinutes: true,
      avoidCollisions: true,
      completedAt: true,
    }),
  }),
  upsert_plan_entry: z.strictObject({ entry: planEntrySchema }),
  update_weekly_plan_entries: z.strictObject({
    entries: z.array(planEntrySchema),
    applied: z.number().int().min(0),
  }),
  set_focus_area: z.strictObject({
    entry: planEntrySchema.pick({ id: true, planId: true, nodeId: true, focus: true }),
  }),
  load_weekly_plan: z.strictObject({
    weekStart: isoDate,
    weekStartsOn: z.number().int().min(0).max(6),
    plan: compactPlanSchema.nullable(),
    entries: z.array(planEntrySchema.omit({ planId: true })),
    resultAreas: z.array(nodeSummarySchema),
    goals: z.array(nodeSummarySchema),
    projects: z.array(nodeSummarySchema),
    previousRewrites: z.array(
      // Calendar day of the prior plan week — not an instant. ISO midnight was one day
      // early when agents (or the wizard) formatted it with local getters west of the
      // server.
      z.tuple([id, z.strictObject({ rewrite: z.string(), weekStart: dateKey })]),
    ),
    schedule: z.strictObject({
      weekStart: isoDate,
      appointmentCount: z.number().int().min(0),
      occurrences: z.array(occurrenceSchema.omit({ checkState: true })),
    }),
  }),
  set_weekly_plan_completed: z.strictObject({
    plan: z.strictObject({ id, completedAt: nullableIsoDate }),
  }),
  list_metrics: z.strictObject({
    metrics: z.array(metricSummarySchema),
    pageInfo: pageInfoSchema,
  }),
  get_metric: z.strictObject({ metric: metricDetailSchema }),
  create_metric: z.strictObject({ metric: metricDetailSchema, created: z.boolean() }),
  update_metric: z.strictObject({ metric: metricDetailSchema }),
  log_metric_entry: z.strictObject({
    entryId: id,
    entryDate: dateKey,
    value: z.number(),
    metric: metricDetailSchema,
    created: z.boolean(),
  }),
  update_metric_entry: z.strictObject({
    entry: metricEntrySchema,
    metric: metricDetailSchema,
  }),
} as const;
