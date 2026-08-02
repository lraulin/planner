import type { OutlineNode } from "@/lib/tree/types";
import { loadOutline } from "@/lib/tree/queries";
import { buildAchieveXml, type ExportOutlineRow, type ExportResult } from "./exportXml";

/**
 * Load this user's outline and render Achieve Full XML for the RA / project / task core.
 */
export async function exportAchieveXmlForUser(userId: string): Promise<ExportResult> {
  const outline = await loadOutline(userId);
  return buildAchieveXml(outline.map(toExportRow));
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
