import type { NodeType } from "@/db/schema";
import {
  boolField,
  decodeDateTime,
  decodeEffortToMinutes,
  decodePercentComplete,
  decodePriority,
  decodeStatus,
  intField,
} from "./encodings";
import { tableRows } from "./parseXml";
import { rtfToPlainText } from "./rtf";
import type { AchDocument, AchMappedNode, AchOutlineMap, AchRow } from "./types";

/** Tables we deliberately do not map in the outline pass. */
const KNOWN_SKIP = new Set([
  "AppointmentRecurrence",
  "AppointmentRecurrenceDeletions",
  "Appointments",
  "Contacts",
  "ContactAddress",
  "ContactEmail",
  "ContactPhones",
  "ContactWeb",
  "ContactImportantDates",
  "ContactDiscussions",
  "ContactHistory",
  "LabelData",
  "Labels",
  "TimeCharts",
  "TimeChartAreas",
  "FileItems",
  "NoteItems",
  "SyncItems",
  "ResourcePools",
  "ResourceCalendars",
  "WorkResources",
  "ResourceAvailability",
  "ResourcePoolAndResourceIdAssociation",
  "ResourceCalendarsSpecialDates",
  "FormLayouts",
  "Users",
  "Metrics",
  "MetricTracking",
  "MasterKeywords",
  "RecordViewCustomizations",
  "RecordViewFieldCustomizations",
  "RecordViewFilterCustomizations",
  "CustomRecordViews",
  "RecordViewCategoryCustomizations",
  "ActiveSyncIDMapping",
  "Images",
  "Goals",
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
  "Wishes",
  "Dreams",
  "DreamImpacts",
  "DreamTeam",
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
]);

const OUTLINE_TABLES = new Set([
  "ResultAreaCategories",
  "ResultAreas",
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
 * - Project → parent project, else its result area
 * - Task → parent task, else its project
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
    if (!parentTask && !projectId) {
      warnings.push(`Task ${achId} has no ProjectId or ParentTaskId; skipped`);
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
        parentAchId: parentTask ?? projectId,
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
    .filter((t) => !OUTLINE_TABLES.has(t))
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
  };
}
