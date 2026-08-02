import type { NodeType, ProgressReview } from "@/db/schema";
import {
  encodeEffortFromMinutes,
  encodePercentComplete,
  encodePriority,
  encodeProgressReview,
  encodeStatus,
} from "./encodings";
import type { AchPriority } from "./types";

/**
 * Minimal outline row for export. Matches what `loadOutline` already returns plus a few
 * detail fields the exporter needs.
 */
export type ExportOutlineRow = {
  id: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  priorityLetter: AchPriority["letter"];
  priorityRank: AchPriority["rank"];
  tcPriorityLetter: AchPriority["letter"];
  tcPriorityRank: AchPriority["rank"];
  state: Parameters<typeof encodeStatus>[0];
  focus: boolean;
  collapsed: boolean;
  notes: string;
  deadline: Date | null;
  targetStart: Date | null;
  targetEnd: Date | null;
  deferredDate: Date | null;
  completedAt: Date | null;
  effortMinutes: number | null;
  effortLeftMinutes: number | null;
  actualEffortMinutes: number | null;
  percentComplete: number | null;
  description?: string;
  purpose: string;
  place?: string;
  category: string | null;
  importance: number | null;
  definition?: string;
  isDream?: boolean;
  vision?: string;
  kindOfPerson?: string;
  personalChanges?: string;
  baseline?: string;
  limitingFactor?: string;
  values?: string;
  question?: string;
  affirmation?: string;
  strategy?: string;
  progressReview?: ProgressReview;
  scorecard?: boolean;
  /** Depth-first index among siblings sharing the same export parent (set by caller or derived). */
  sortKey: string;
};

export type ExportResult = {
  xml: string;
  counts: Record<"result_area" | "goal" | "project" | "task" | "omitted", number>;
  warnings: string[];
};

const EXPORT_TYPES = new Set<NodeType>(["result_area", "goal", "project", "task"]);

/**
 * Build Achieve Full XML for the outline core (categories, RAs, goals, projects, tasks).
 *
 * Notes go out as plain text (not RTF). Omits the huge embedded XSD — AP's Load from XML
 * can infer schema from the data rows for this subset.
 */
export function buildAchieveXml(rows: ExportOutlineRow[]): ExportResult {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const warnings: string[] = [];
  const counts = { result_area: 0, goal: 0, project: 0, task: 0, omitted: 0 };

  type Exported = {
    row: ExportOutlineRow;
    /** Our node id of the export parent, or null for roots. */
    exportParentId: string | null;
  };

  const exported: Exported[] = [];

  for (const row of rows) {
    if (!EXPORT_TYPES.has(row.type)) {
      counts.omitted++;
      continue;
    }
    const exportParentId = nearestExportAncestor(row.parentId, byId);
    exported.push({ row, exportParentId });
  }

  // Sibling ordinal among the same export parent.
  const ordinalById = new Map<string, number>();
  const byExportParent = new Map<string | null, Exported[]>();
  for (const item of exported) {
    const list = byExportParent.get(item.exportParentId) ?? [];
    list.push(item);
    byExportParent.set(item.exportParentId, list);
  }
  for (const [, list] of byExportParent) {
    list.sort((a, b) => a.row.sortKey.localeCompare(b.row.sortKey));
    list.forEach((item, i) => ordinalById.set(item.row.id, i));
  }

  // Categories from result areas.
  const categoryNames: string[] = [];
  const categoryIdByName = new Map<string, string>();
  for (const { row } of exported) {
    if (row.type !== "result_area") continue;
    const name = (row.category ?? "").trim() || "Uncategorized";
    if (!categoryIdByName.has(name)) {
      const id = syntheticGuid(`cat:${name}`);
      categoryIdByName.set(name, id);
      categoryNames.push(name);
    }
  }

  // Stable Achieve-style GUIDs derived from our ids so re-export is deterministic.
  const achId = (id: string) => syntheticGuid(`node:${id}`);

  const parts: string[] = [`<?xml version="1.0" standalone="yes"?>`, `<AchieveDB>`];

  categoryNames.forEach((name, i) => {
    parts.push(
      element("ResultAreaCategories", {
        CategoryId: categoryIdByName.get(name)!,
        Name: name,
        WorkRelated: name.toLowerCase() === "work" ? "true" : "false",
        __ORDINAL__: String(i),
      }),
    );
  });

  for (const { row, exportParentId } of exported) {
    if (row.type !== "result_area") continue;
    counts.result_area++;
    const parent =
      exportParentId && byId.get(exportParentId)?.type === "result_area"
        ? achId(exportParentId)
        : null;
    const catName = (row.category ?? "").trim() || "Uncategorized";
    parts.push(
      element("ResultAreas", {
        ResultAreaId: achId(row.id),
        CategoryId: categoryIdByName.get(catName)!,
        Name: row.name,
        Description: row.description ?? "",
        ParentResultAreaId: parent,
        IsExpanded: row.collapsed ? "false" : "true",
        Importance: row.importance !== null ? String(row.importance) : undefined,
        Priority: String(
          encodePriority({ letter: row.priorityLetter, rank: row.priorityRank }),
        ),
        Notes: row.notes,
        __ORDINAL__: String(ordinalById.get(row.id) ?? 0),
      }),
    );
  }

  for (const { row, exportParentId } of exported) {
    if (row.type !== "goal") continue;
    counts.goal++;
    const parentRow = exportParentId ? byId.get(exportParentId) : null;
    const parentGoal = parentRow?.type === "goal" ? achId(exportParentId!) : null;
    const resultAreaId = nearestOfType(row.id, "result_area", byId);
    // Prefer a direct project child as the Achieve ProjectId link.
    const linkedProject = exported.find(
      (e) => e.row.type === "project" && e.exportParentId === row.id,
    );
    const completed = row.state === "completed";
    parts.push(
      element(row.isDream ? "Dreams" : "Goals", {
        ...(row.isDream
          ? { DreamId: achId(row.id), Title: row.name }
          : { GoalId: achId(row.id), Title: row.name }),
        ResultAreaId: resultAreaId ? achId(resultAreaId) : undefined,
        ParentGoalId: !row.isDream ? parentGoal : undefined,
        ParentDreamId: row.isDream ? parentGoal : undefined,
        DreamId:
          !row.isDream && parentRow?.isDream ? achId(exportParentId!) : undefined,
        ProjectId: linkedProject ? achId(linkedProject.row.id) : undefined,
        Definition: row.definition ?? row.description ?? "",
        Purpose: row.purpose,
        Vision: row.vision ?? "",
        KindOfPerson: row.kindOfPerson ?? "",
        ChangesRequired: row.personalChanges ?? "",
        Baseline: row.baseline ?? "",
        LimitingFactor: row.limitingFactor ?? "",
        Values: row.values ?? "",
        Question: row.question ?? "",
        Affirmation: row.affirmation ?? "",
        Strategy: row.strategy ?? "",
        Priority: String(
          encodePriority({ letter: row.priorityLetter, rank: row.priorityRank }),
        ),
        Status: String(encodeStatus(row.state)),
        IsCompleted: completed ? "true" : "false",
        DateCompleted: completed ? formatAchDate(row.completedAt) : undefined,
        Deadline: formatAchDate(row.deadline),
        TargetStartDate: formatAchDate(row.targetStart),
        ProgressReviewSchedule: String(
          encodeProgressReview(row.progressReview ?? "none"),
        ),
        Scorecard: row.scorecard ? "true" : "false",
        IsExpanded: row.collapsed ? "false" : "true",
        __ORDINAL__: String(ordinalById.get(row.id) ?? 0),
      }),
    );
  }

  for (const { row, exportParentId } of exported) {
    if (row.type !== "project") continue;
    counts.project++;
    const parentRow = exportParentId ? byId.get(exportParentId) : null;
    const parentProject = parentRow?.type === "project" ? achId(exportParentId!) : null;
    const resultAreaId = nearestOfType(row.id, "result_area", byId);
    if (!resultAreaId) {
      warnings.push(
        `Project "${row.name}" has no result-area ancestor; exported without ResultAreaId`,
      );
    }
    const effort = encodeEffortFromMinutes(row.effortMinutes);
    const effortLeft = encodeEffortFromMinutes(row.effortLeftMinutes);
    const actual = encodeEffortFromMinutes(row.actualEffortMinutes);
    const completed = row.state === "completed";

    parts.push(
      element("Projects", {
        ProjectId: achId(row.id),
        ResultAreaId: resultAreaId ? achId(resultAreaId) : undefined,
        Name: row.name,
        Priority: String(
          encodePriority({ letter: row.priorityLetter, rank: row.priorityRank }),
        ),
        Description: row.description ?? "",
        Purpose: row.purpose,
        ParentProjectId: parentProject,
        Expanded: row.collapsed ? "false" : "true",
        Status: String(encodeStatus(row.state)),
        PercentCompleted: String(
          encodePercentComplete(row.percentComplete ?? (completed ? 100 : 0)),
        ),
        IsCompleted: completed ? "true" : "false",
        CompletedDate: completed ? formatAchDate(row.completedAt) : undefined,
        ExpectedEffort: effort.amount !== null ? String(effort.amount) : undefined,
        ExpectedEffortUnits: effort.amount !== null ? String(effort.units) : undefined,
        EffortLeft: effortLeft.amount !== null ? String(effortLeft.amount) : undefined,
        EffortLeftUnits:
          effortLeft.amount !== null ? String(effortLeft.units) : undefined,
        ActualEffort: actual.amount !== null ? String(actual.amount) : undefined,
        ActualEffortUnits: actual.amount !== null ? String(actual.units) : undefined,
        TargetEndDate: formatAchDate(row.targetEnd),
        PlannedStartDate: formatAchDate(row.targetStart),
        Deadline: formatAchDate(row.deadline),
        Focus: row.focus ? "true" : "false",
        Place: row.place ?? "",
        Notes: row.notes,
        TCPriority: String(
          encodePriority({
            letter: row.tcPriorityLetter,
            rank: row.tcPriorityRank,
          }),
        ),
        __ORDINAL__: String(ordinalById.get(row.id) ?? 0),
      }),
    );
  }

  for (const { row, exportParentId } of exported) {
    if (row.type !== "task") continue;
    counts.task++;
    const parentRow = exportParentId ? byId.get(exportParentId) : null;
    const parentTask = parentRow?.type === "task" ? achId(exportParentId!) : null;
    const projectId = nearestOfType(row.id, "project", byId);
    const resultAreaId = nearestOfType(row.id, "result_area", byId);
    if (!projectId && !parentTask) {
      warnings.push(
        `Task "${row.name}" has no project ancestor; exported with ResultAreaId only`,
      );
    }
    const effort = encodeEffortFromMinutes(row.effortMinutes);
    const effortLeft = encodeEffortFromMinutes(row.effortLeftMinutes);
    const actual = encodeEffortFromMinutes(row.actualEffortMinutes);
    const completed = row.state === "completed";

    parts.push(
      element("Tasks", {
        TaskId: achId(row.id),
        ProjectId: projectId ? achId(projectId) : undefined,
        ResultAreaId: resultAreaId ? achId(resultAreaId) : undefined,
        Name: row.name,
        Priority: String(
          encodePriority({ letter: row.priorityLetter, rank: row.priorityRank }),
        ),
        Description: row.description ?? "",
        ParentTaskId: parentTask,
        Expanded: row.collapsed ? "false" : "true",
        Status: String(encodeStatus(row.state)),
        PercentCompleted: String(
          encodePercentComplete(row.percentComplete ?? (completed ? 100 : 0)),
        ),
        IsCompleted: completed ? "true" : "false",
        CompletedDate: completed ? formatAchDate(row.completedAt) : undefined,
        ExpectedEffortBest: effort.amount !== null ? String(effort.amount) : undefined,
        ExpectedEffortBestUnits:
          effort.amount !== null ? String(effort.units) : undefined,
        ExpectedEffortLow: effort.amount !== null ? String(effort.amount) : undefined,
        ExpectedEffortLowUnits:
          effort.amount !== null ? String(effort.units) : undefined,
        ExpectedEffortHigh: effort.amount !== null ? String(effort.amount) : undefined,
        ExpectedEffortHighUnits:
          effort.amount !== null ? String(effort.units) : undefined,
        EffortLeft: effortLeft.amount !== null ? String(effortLeft.amount) : undefined,
        EffortLeftUnits:
          effortLeft.amount !== null ? String(effortLeft.units) : undefined,
        ActualEffort: actual.amount !== null ? String(actual.amount) : undefined,
        ActualEffortUnits: actual.amount !== null ? String(actual.units) : undefined,
        TargetStartDate: formatAchDate(row.targetStart),
        TargetEndDate: formatAchDate(row.targetEnd),
        Deadline: formatAchDate(row.deadline),
        DeferredDate: formatAchDate(row.deferredDate),
        Focus: row.focus ? "true" : "false",
        Place: row.place ?? "",
        Notes: row.notes,
        TCPriority: String(
          encodePriority({
            letter: row.tcPriorityLetter,
            rank: row.tcPriorityRank,
          }),
        ),
        __ORDINAL__: String(ordinalById.get(row.id) ?? 0),
      }),
    );
  }

  parts.push(`</AchieveDB>`);
  return { xml: parts.join("\n") + "\n", counts, warnings };
}

function nearestExportAncestor(
  parentId: string | null,
  byId: Map<string, ExportOutlineRow>,
): string | null {
  let cur = parentId;
  while (cur) {
    const p = byId.get(cur);
    if (!p) return null;
    if (EXPORT_TYPES.has(p.type)) {
      return cur;
    }
    cur = p.parentId;
  }
  return null;
}

function nearestOfType(
  startId: string,
  type: NodeType,
  byId: Map<string, ExportOutlineRow>,
): string | null {
  let cur: string | null = startId;
  while (cur) {
    const n = byId.get(cur);
    if (!n) return null;
    if (n.type === type) return cur;
    cur = n.parentId;
  }
  return null;
}

/** Deterministic UUID v5-ish hex from a string (not cryptographic; fine for interchange). */
function syntheticGuid(seed: string): string {
  // FNV-1a 128-bit style mix into 32 hex chars.
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0xdeadbeef;
  let h3 = 0x811c9dc5 ^ 0xcafebabe;
  let h4 = 0x811c9dc5 ^ 0x8badf00d;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 16);
    h3 = Math.imul(h3 ^ c, 0x01000193) ^ (h2 >>> 16);
    h4 = Math.imul(h4 ^ c, 0x01000193) ^ (h3 >>> 16);
  }
  const hex = [h1, h2, h3, h4]
    .map((h) => (h >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function formatAchDate(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  // Local-naive ISO without ms, with Z — AP accepts offset timestamps; Z is fine.
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function element(
  name: string,
  fields: Record<string, string | null | undefined>,
): string {
  const lines = [`  <${name}>`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    lines.push(`    <${key}>${escapeXml(value)}</${key}>`);
  }
  lines.push(`  </${name}>`);
  return lines.join("\n");
}
