import type { NodeType, ProgressReview } from "@/db/schema";
import {
  boolField,
  decodeDateTime,
  decodeEffortToMinutes,
  decodePercentComplete,
  decodePriority,
  decodeProgressReview,
  decodeStatus,
  intField,
} from "./encodings";
import { EXTRAS_TABLES } from "./mapExtras";
import { tableRows } from "./parseXml";
import { rtfToPlainText } from "./rtf";
import type { AchDocument, AchMappedNode, AchOutlineMap, AchRow } from "./types";

/**
 * Tables we know about but do not map yet. Grouped by product area so the import summary
 * and roadmap stay honest about what Full XML still carries that we ignore.
 *
 * Tier A (next): appointments, time charts, wishes, project child grids, notes.
 * Tier B: contacts, labels (metrics → extras, done).
 * Tier C (UI chrome / sync): form layouts, record views, Outlook SyncItems, ActiveSync.
 */
const KNOWN_SKIP = new Set([
  // Calendar (extras pass handles Appointments / TimeCharts; recurrence detail is best-effort)
  "AppointmentRecurrence",
  "AppointmentRecurrenceDeletions",
  // Wish list + goal sub-grids (Wishes handled in extras)
  "GoalObstacles",
  "GoalResources",
  "GoalTeam",
  "GoalEnvironment",
  "GoalSteps",
  "GoalActions",
  "GoalActionTracking",
  "GoalEmpoweringBeliefs",
  "GoalLimitingBeliefs",
  "GoalRewards",
  "GoalBenefits",
  "GoalProgressEntries",
  "GuidingPrinciples",
  "DreamImpacts",
  "DreamTeam",
  // Project child lists
  "ProjectObjectives",
  "ProjectPriorities",
  "ProjectRisks",
  "ProjectWorkResources",
  "ProjectStakeholders",
  "ProjectIssues",
  "ProjectCategories",
  "ProjectStrategies",
  "ProjectTeamRoles",
  "ProjectContacts",
  "ProjectAttachments",
  "ProjectTimeCommitments",
  "TaskDependencies",
  "TaskWorkResources",
  "TaskContacts",
  "TaskAttachments",
  // Files
  "FileItems",
  // Contacts
  "Contacts",
  "ContactAddress",
  "ContactEmail",
  "ContactPhones",
  "ContactWeb",
  "ContactImportantDates",
  "ContactDiscussions",
  "ContactHistory",
  // Labels (colour lookup used by extras; not imported as entities)
  "Labels",
  // Metrics + MetricTracking handled in mapExtras (Tier B → done).
  "MasterKeywords",
  "ResourcePools",
  "ResourceCalendars",
  "WorkResources",
  "ResourceAvailability",
  "ResourcePoolAndResourceIdAssociation",
  "ResourceCalendarsSpecialDates",
  // App chrome + Outlook
  "FormLayouts",
  "Users",
  "RecordViewCustomizations",
  "RecordViewFieldCustomizations",
  "RecordViewFilterCustomizations",
  "CustomRecordViews",
  "RecordViewCategoryCustomizations",
  "ActiveSyncIDMapping",
  "Images",
  "SyncItems",
]);

/** Outline node tables — everything else is either extras or KNOWN_SKIP. */
const OUTLINE_TABLES = new Set([
  "ResultAreaCategories",
  "ResultAreas",
  "Dreams",
  "Goals",
  "Projects",
  "Tasks",
]);

/**
 * Map Achieve Full XML outline tables into our node shape.
 *
 * Pure: no database. Parent links stay as Achieve GUIDs (`parentAchId`); a later writer
 * assigns UUIDs and `sortKey` from `ordinal` among siblings.
 *
 * Hierarchy:
 * - Result area → parent result area (or root)
 * - Dream / Goal → parent goal/dream, else result area, else RA of linked project
 * - Project → parent project, else its result area
 * - Task → parent task, else project, else result area
 */
export function mapOutline(doc: AchDocument): AchOutlineMap {
  const warnings: string[] = [];
  const categories = new Map<string, string>();
  for (const row of tableRows(doc, "ResultAreaCategories")) {
    const id = row.CategoryId;
    if (id) categories.set(id, row.Name ?? "");
  }

  const nodes: AchMappedNode[] = [];

  for (const row of tableRows(doc, "ResultAreas")) {
    const achId = row.ResultAreaId;
    if (!achId) {
      warnings.push("ResultAreas row missing ResultAreaId; skipped");
      continue;
    }
    const categoryId = row.CategoryId;
    nodes.push(
      baseNode({
        achId,
        type: "result_area",
        parentAchId: emptyToNull(row.ParentResultAreaId),
        name: row.Name ?? "",
        ordinal: intField(row, "__ORDINAL__") ?? 0,
        row,
        categoryName: categoryId ? (categories.get(categoryId) ?? null) : null,
        importance: intField(row, "Importance"),
        // Result areas use Priority + Importance; no effort.
        effortMinutes: null,
        effortLeftMinutes: null,
        actualEffortMinutes: null,
        percentComplete: null,
        description: row.Description ?? "",
        purpose: "",
        place: "",
        mission: row.MissionStatement ?? "",
        importanceReason: row.ImportanceReason ?? "",
        idealOuterVision: row.IdealVisionOuterExperience ?? "",
        idealInnerVision: row.IdealVisionInnerExperience ?? "",
        strengths: row.Strengths ?? "",
        weaknesses: row.Weaknesses ?? "",
        opportunities: row.Opportunities ?? "",
        threats: row.Threats ?? "",
      }),
    );
  }

  // Project → ResultArea / Name for goals that only carry ProjectId.
  // Real Achieve dumps almost never fill Goals.Title; the linked project's Name is what
  // the user sees as the goal title in AP (and is our best import label).
  const projectResultArea = new Map<string, string>();
  const projectName = new Map<string, string>();
  for (const row of tableRows(doc, "Projects")) {
    const pid = row.ProjectId;
    if (!pid) continue;
    const ra = emptyToNull(row.ResultAreaId);
    if (ra) projectResultArea.set(pid, ra);
    const pname = (row.Name ?? "").trim();
    if (pname) projectName.set(pid, pname);
  }

  // Dreams first so goals can parent under them by DreamId.
  for (const row of tableRows(doc, "Dreams")) {
    const achId = row.DreamId;
    if (!achId) {
      warnings.push("Dreams row missing DreamId; skipped");
      continue;
    }
    const name =
      (row.Title ?? "").trim() || (row.Definition ?? "").trim() || "(Untitled dream)";
    nodes.push(
      baseNode({
        achId,
        type: "goal",
        parentAchId: emptyToNull(row.ParentDreamId) ?? emptyToNull(row.ResultAreaId),
        name,
        ordinal: intField(row, "__ORDINAL__") ?? 0,
        row,
        categoryName: null,
        importance: null,
        effortMinutes: null,
        effortLeftMinutes: null,
        actualEffortMinutes: null,
        percentComplete: null,
        description: row.Definition ?? "",
        purpose: row.Purpose ?? "",
        place: "",
        isDream: true,
        definition: row.Definition ?? row.IdealizedDefinition ?? "",
        vision: row.OuterExperienceVision ?? "",
        kindOfPerson: "",
        personalChanges: "",
        baseline: "",
        limitingFactor: "",
        values: "",
        question: "",
        affirmation: "",
        range: "",
        progressReview: "none",
        scorecard: false,
        strategy: row.Strategy ?? "",
        deadlineField: undefined,
        targetStartField: undefined,
      }),
    );
  }

  for (const row of tableRows(doc, "Goals")) {
    const achId = row.GoalId;
    if (!achId) {
      warnings.push("Goals row missing GoalId; skipped");
      continue;
    }
    const linkedProject = emptyToNull(row.ProjectId);
    const parentGoal = emptyToNull(row.ParentGoalId);
    const resultArea = emptyToNull(row.ResultAreaId);
    const dreamId = emptyToNull(row.DreamId);
    const parentAchId =
      parentGoal ??
      resultArea ??
      dreamId ??
      (linkedProject ? (projectResultArea.get(linkedProject) ?? null) : null);

    const name =
      (row.Title ?? "").trim() ||
      (row.Definition ?? "").trim() ||
      (linkedProject ? (projectName.get(linkedProject) ?? "") : "") ||
      "(Untitled goal)";

    nodes.push(
      baseNode({
        achId,
        type: "goal",
        parentAchId,
        name,
        ordinal: intField(row, "__ORDINAL__") ?? 0,
        row,
        categoryName: null,
        importance: null,
        effortMinutes: null,
        effortLeftMinutes: null,
        actualEffortMinutes: null,
        percentComplete: null,
        description: row.Definition ?? "",
        purpose: row.Purpose ?? "",
        place: "",
        isDream: false,
        definition: row.Definition ?? "",
        vision: row.Vision ?? "",
        kindOfPerson: row.KindOfPerson ?? "",
        personalChanges: row.ChangesRequired ?? "",
        baseline: row.Baseline ?? "",
        limitingFactor: row.LimitingFactor ?? "",
        values: row.Values ?? "",
        question: row.Question ?? "",
        affirmation: row.Affirmation ?? "",
        range: "",
        progressReview: decodeProgressReview(intField(row, "ProgressReviewSchedule")),
        scorecard: boolField(row, "Scorecard", false),
        strategy: row.Strategy ?? "",
        linkedProjectAchId: linkedProject,
        deadlineField: "Deadline",
        targetStartField: "TargetStartDate",
      }),
    );
  }

  for (const row of tableRows(doc, "Projects")) {
    const achId = row.ProjectId;
    if (!achId) {
      warnings.push("Projects row missing ProjectId; skipped");
      continue;
    }
    const parentProject = emptyToNull(row.ParentProjectId);
    const resultArea = emptyToNull(row.ResultAreaId);
    nodes.push(
      baseNode({
        achId,
        type: "project",
        parentAchId: parentProject ?? resultArea,
        name: row.Name ?? "",
        ordinal: intField(row, "__ORDINAL__") ?? 0,
        row,
        categoryName: null,
        importance: null,
        effortMinutes: decodeEffortToMinutes(
          intField(row, "ExpectedEffort"),
          intField(row, "ExpectedEffortUnits"),
        ),
        effortLeftMinutes: decodeEffortToMinutes(
          intField(row, "EffortLeft"),
          intField(row, "EffortLeftUnits"),
        ),
        actualEffortMinutes: decodeEffortToMinutes(
          intField(row, "ActualEffort"),
          intField(row, "ActualEffortUnits"),
        ),
        percentComplete: decodePercentComplete(intField(row, "PercentCompleted")),
        description: row.Description ?? "",
        purpose: row.Purpose ?? "",
        place: row.Place ?? "",
        strategy: row.Strategy ?? "",
        blockSizeMinutes: intField(row, "ProjectBlockSize"),
        // DefaultTimePerWeek is minutes when non-negative; -1 means unset in AP.
        timePerWeekMinutes: (() => {
          const v = intField(row, "DefaultTimePerWeek");
          return v !== null && v >= 0 ? v : null;
        })(),
        onlyShowNextTask: (intField(row, "ShowOnlyNextTaskInChooser") ?? 0) !== 0,
        targetEndField: "TargetEndDate",
      }),
    );
  }

  for (const row of tableRows(doc, "Tasks")) {
    const achId = row.TaskId;
    if (!achId) {
      warnings.push("Tasks row missing TaskId; skipped");
      continue;
    }
    const parentTask = emptyToNull(row.ParentTaskId);
    const projectId = emptyToNull(row.ProjectId);
    const resultAreaId = emptyToNull(row.ResultAreaId);
    const parentAchId = parentTask ?? projectId ?? resultAreaId;
    if (!parentAchId) {
      warnings.push(
        `Task ${achId} has no ProjectId, ParentTaskId, or ResultAreaId; skipped`,
      );
      continue;
    }
    // Prefer Best estimate when present, else Low.
    const effort =
      decodeEffortToMinutes(
        intField(row, "ExpectedEffortBest"),
        intField(row, "ExpectedEffortBestUnits"),
      ) ??
      decodeEffortToMinutes(
        intField(row, "ExpectedEffortLow"),
        intField(row, "ExpectedEffortLowUnits"),
      );

    nodes.push(
      baseNode({
        achId,
        type: "task",
        parentAchId,
        name: row.Name ?? "",
        ordinal: intField(row, "__ORDINAL__") ?? 0,
        row,
        categoryName: null,
        importance: null,
        effortMinutes: effort,
        effortLeftMinutes: decodeEffortToMinutes(
          intField(row, "EffortLeft"),
          intField(row, "EffortLeftUnits"),
        ),
        actualEffortMinutes: decodeEffortToMinutes(
          intField(row, "ActualEffort"),
          intField(row, "ActualEffortUnits"),
        ),
        percentComplete: decodePercentComplete(intField(row, "PercentCompleted")),
        description: row.Description ?? "",
        purpose: "",
        place: row.Place ?? "",
        deadlineField: "Deadline",
        targetStartField: "TargetStartDate",
        targetEndField: "TargetEndDate",
        deferredField: "DeferredDate",
      }),
    );
  }

  const skippedTables = Object.keys(doc.tables)
    .filter((t) => !OUTLINE_TABLES.has(t) && !EXTRAS_TABLES.has(t))
    .sort();

  for (const t of skippedTables) {
    if (!KNOWN_SKIP.has(t)) {
      warnings.push(`Unknown table not mapped: ${t}`);
    }
  }

  const counts: Record<NodeType, number> = {
    result_area: 0,
    goal: 0,
    project: 0,
    task: 0,
  };
  for (const n of nodes) counts[n.type]++;

  // Stable order: type rank then ordinal then name — helpful for deterministic tests.
  const typeRank: Record<NodeType, number> = {
    result_area: 0,
    goal: 1,
    project: 2,
    task: 3,
  };
  nodes.sort((a, b) => {
    const tr = typeRank[a.type] - typeRank[b.type];
    if (tr !== 0) return tr;
    if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
    return a.name.localeCompare(b.name);
  });

  return { nodes, skippedTables, counts, warnings };
}

function emptyToNull(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  return value;
}

function baseNode(args: {
  achId: string;
  type: NodeType;
  parentAchId: string | null;
  name: string;
  ordinal: number;
  row: AchRow;
  categoryName: string | null;
  importance: number | null;
  effortMinutes: number | null;
  effortLeftMinutes: number | null;
  actualEffortMinutes: number | null;
  percentComplete: number | null;
  description: string;
  purpose: string;
  place: string;
  mission?: string;
  importanceReason?: string;
  idealOuterVision?: string;
  idealInnerVision?: string;
  strengths?: string;
  weaknesses?: string;
  opportunities?: string;
  threats?: string;
  strategy?: string;
  blockSizeMinutes?: number | null;
  timePerWeekMinutes?: number | null;
  onlyShowNextTask?: boolean;
  isDream?: boolean;
  definition?: string;
  vision?: string;
  kindOfPerson?: string;
  personalChanges?: string;
  baseline?: string;
  limitingFactor?: string;
  values?: string;
  question?: string;
  affirmation?: string;
  range?: string;
  progressReview?: ProgressReview;
  scorecard?: boolean;
  linkedProjectAchId?: string | null;
  deadlineField?: string;
  targetStartField?: string;
  targetEndField?: string;
  deferredField?: string;
}): AchMappedNode {
  const { row } = args;
  const isCompleted = boolField(row, "IsCompleted", false);
  let state = decodeStatus(intField(row, "Status"));
  // Prefer the explicit completed flag when it disagrees with a stale Status code.
  if (isCompleted) state = "completed";

  const deadline = args.deadlineField
    ? decodeDateTime(row[args.deadlineField])
    : decodeDateTime(row.Deadline);
  const targetStart = args.targetStartField
    ? decodeDateTime(row[args.targetStartField])
    : decodeDateTime(row.TargetStartDate ?? row.PlannedStartDate);
  const targetEnd = args.targetEndField
    ? decodeDateTime(row[args.targetEndField])
    : decodeDateTime(row.TargetEndDate);
  const deferredDate = args.deferredField
    ? decodeDateTime(row[args.deferredField])
    : null;
  const completedAt =
    decodeDateTime(row.CompletedDate) ?? decodeDateTime(row.DateCompleted);

  // Projects/Tasks use `Expanded`; result areas use `IsExpanded`.
  const expanded =
    row.Expanded !== undefined
      ? boolField(row, "Expanded", true)
      : boolField(row, "IsExpanded", true);

  return {
    achId: args.achId,
    type: args.type,
    parentAchId: args.parentAchId,
    name: args.name,
    ordinal: args.ordinal,
    priority: decodePriority(intField(row, "Priority")),
    tcPriority: decodePriority(intField(row, "TCPriority")),
    state,
    focus: boolField(row, "Focus", false),
    collapsed: !expanded,
    notes: rtfToPlainText(row.Notes),
    deadline,
    targetStart,
    targetEnd,
    deferredDate,
    completedAt: state === "completed" ? completedAt : null,
    effortMinutes: args.effortMinutes,
    effortLeftMinutes: args.effortLeftMinutes,
    actualEffortMinutes: args.actualEffortMinutes,
    percentComplete: args.percentComplete,
    description: args.description,
    place: args.place,
    purpose: args.purpose,
    importance: args.importance,
    categoryName: args.categoryName,
    mission: args.mission ?? "",
    importanceReason: args.importanceReason ?? "",
    idealOuterVision: args.idealOuterVision ?? "",
    idealInnerVision: args.idealInnerVision ?? "",
    strengths: args.strengths ?? "",
    weaknesses: args.weaknesses ?? "",
    opportunities: args.opportunities ?? "",
    threats: args.threats ?? "",
    strategy: args.strategy ?? "",
    blockSizeMinutes: args.blockSizeMinutes ?? null,
    timePerWeekMinutes: args.timePerWeekMinutes ?? null,
    onlyShowNextTask: args.onlyShowNextTask ?? false,
    isDream: args.isDream ?? false,
    definition: args.definition ?? "",
    vision: args.vision ?? "",
    kindOfPerson: args.kindOfPerson ?? "",
    personalChanges: args.personalChanges ?? "",
    baseline: args.baseline ?? "",
    limitingFactor: args.limitingFactor ?? "",
    values: args.values ?? "",
    question: args.question ?? "",
    affirmation: args.affirmation ?? "",
    range: args.range ?? "",
    progressReview: args.progressReview ?? "none",
    scorecard: args.scorecard ?? false,
    linkedProjectAchId: args.linkedProjectAchId ?? null,
  };
}
