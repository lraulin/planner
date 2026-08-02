import type { OutlineNode } from "@/lib/tree/types";
import { getMetricDetail, listMetrics } from "@/lib/metrics/queries";
import { loadOutline } from "@/lib/tree/queries";
import {
  buildAchieveXml,
  type ExportMetricRow,
  type ExportOutlineRow,
  type ExportResult,
} from "./exportXml";

/**
 * Load this user's outline + metrics and render Achieve Full XML
 * (RA / project / task core and Metrics / MetricTracking).
 */
export async function exportAchieveXmlForUser(userId: string): Promise<ExportResult> {
  const [outline, metricList] = await Promise.all([
    loadOutline(userId),
    listMetrics(userId),
  ]);
  const metricRows: ExportMetricRow[] = [];
  for (const m of metricList) {
    const detail = await getMetricDetail(userId, m.id);
    if (!detail) continue;
    metricRows.push({
      id: detail.id,
      ownerNodeId: detail.ownerNodeId,
      title: detail.title,
      category: detail.category,
      question: detail.question,
      description: detail.description,
      reason: detail.reason,
      units: detail.units,
      active: detail.active,
      priorityLetter: detail.priorityLetter,
      priorityRank: detail.priorityRank,
      metricType: detail.metricType,
      objectiveTarget: detail.objectiveTarget,
      sortKey: detail.sortKey,
      entries: detail.entries.map((e) => ({
        id: e.id,
        entryDate: e.entryDate,
        entryType: e.entryType,
        target: e.target,
        value: e.value,
      })),
    });
  }
  return buildAchieveXml(outline.map(toExportRow), metricRows);
}

function toExportRow(n: OutlineNode): ExportOutlineRow {
  return {
    id: n.id,
    parentId: n.parentId,
    type: n.type,
    name: n.name,
    priorityLetter: n.priorityLetter,
    priorityRank: n.priorityRank,
    tcPriorityLetter: n.tcPriorityLetter,
    tcPriorityRank: n.tcPriorityRank,
    state: n.state,
    focus: n.focus,
    collapsed: n.collapsed,
    notes: n.notes,
    deadline: n.deadline,
    targetStart: n.targetStart,
    targetEnd: n.targetEnd,
    deferredDate: n.deferredDate,
    completedAt: n.completedAt,
    effortMinutes: n.effortMinutes,
    effortLeftMinutes: n.effortLeftMinutes,
    actualEffortMinutes: n.actualEffortMinutes,
    percentComplete: n.percentComplete,
    purpose: n.purpose,
    category: n.category,
    importance: n.importance,
    definition: n.definition,
    isDream: n.isDream,
    sortKey: n.sortKey,
  };
}
