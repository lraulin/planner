import { db } from "@/db";
import {
  goalDetails,
  nodes,
  projectDetails,
  resultAreaDetails,
  taskDetails,
} from "@/db/schema";
import type { NodeType } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { assertCanNest } from "@/lib/tree/hierarchy";
import { between } from "@/lib/tree/sortKey";
import { mapOutline } from "./mapOutline";
import { parseAchXml } from "./parseXml";
import type { AchMappedNode, AchOutlineMap } from "./types";

/** Provenance tag on every row written from Achieve XML. */
export const ACHIEVE_EXTERNAL_SOURCE = "achieve";

export type ImportMode = "merge" | "replace";

export type ImportResult = {
  created: number;
  counts: Record<NodeType, number>;
  warnings: string[];
  skippedTables: string[];
};

/**
 * Parse Achieve Full XML and write the outline core into the user's tree:
 * result areas, goals/dreams, projects, and tasks.
 *
 * - **replace** — deletes this user's entire outline first (cascades details).
 * - **merge** — appends; parents that are not in the file become roots (with a warning).
 *
 * Each imported row keeps Achieve's GUID as `externalId` with source `"achieve"`, so a
 * later pass can recognise what came from AP. Import does not update existing rows by
 * GUID yet — re-importing the same file in merge mode will duplicate.
 *
 * Goals that carry only a `ProjectId` association are placed under that project's result
 * area, then the project is reparented under the goal so our hierarchy matches the link.
 */
export async function importAchieveXml(params: {
  userId: string;
  xml: string;
  mode: ImportMode;
}): Promise<ImportResult> {
  const { userId, xml, mode } = params;
  const mapped = mapOutline(parseAchXml(xml));
  return writeMappedOutline({ userId, mapped, mode });
}

/** Insert an already-mapped outline (tests can build one without XML). */
export async function writeMappedOutline(params: {
  userId: string;
  mapped: AchOutlineMap;
  mode: ImportMode;
}): Promise<ImportResult> {
  const { userId, mapped, mode } = params;
  const warnings = [...mapped.warnings];

  return db.transaction(async (tx) => {
    if (mode === "replace") {
      await tx.delete(nodes).where(eq(nodes.userId, userId));
    }

    const idByAch = new Map<string, string>();
    const typeByAch = new Map<string, NodeType>();
    for (const n of mapped.nodes) {
      typeByAch.set(n.achId, n.type);
    }

    const remaining = [...mapped.nodes];
    let created = 0;
    // sortKey cursor per resolved parent (our uuid or null)
    const lastKeyByParent = new Map<string | null, string | null>();

    while (remaining.length > 0) {
      const batch: AchMappedNode[] = [];
      const rest: AchMappedNode[] = [];

      for (const n of remaining) {
        if (!n.parentAchId || idByAch.has(n.parentAchId)) {
          batch.push(n);
        } else if (!typeByAch.has(n.parentAchId)) {
          // Parent is outside this file (partial export). Import at root.
          warnings.push(
            `${n.type} "${n.name}" parent ${n.parentAchId} not in file; imported at root`,
          );
          batch.push({ ...n, parentAchId: null });
        } else {
          rest.push(n);
        }
      }

      if (batch.length === 0) {
        // Cycle or bug — force remaining at root rather than hang.
        for (const n of rest) {
          warnings.push(
            `${n.type} "${n.name}" could not resolve parent; imported at root`,
          );
          batch.push({ ...n, parentAchId: null });
        }
        rest.length = 0;
      }

      batch.sort((a, b) => {
        const pa = a.parentAchId ?? "";
        const pb = b.parentAchId ?? "";
        if (pa !== pb) return pa.localeCompare(pb);
        if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
        return a.name.localeCompare(b.name);
      });

      for (const n of batch) {
        const parentId = n.parentAchId ? (idByAch.get(n.parentAchId) ?? null) : null;
        const parentType = n.parentAchId
          ? (typeByAch.get(n.parentAchId) ?? null)
          : null;

        try {
          assertCanNest(n.type, parentType);
        } catch (err) {
          warnings.push(
            `Skipped ${n.type} "${n.name}": ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        const prevKey = lastKeyByParent.get(parentId) ?? null;
        const sortKey = between(prevKey, null);
        lastKeyByParent.set(parentId, sortKey);

        // Our CHECK forbids target start before deferred. AP can carry both without that
        // rule — drop the deferred date rather than fail the whole import.
        let deferredDate = n.deferredDate;
        if (
          deferredDate &&
          n.targetStart &&
          n.targetStart.getTime() < deferredDate.getTime()
        ) {
          warnings.push(
            `"${n.name}": deferred date after target start; deferred cleared on import`,
          );
          deferredDate = null;
        }

        const [row] = await tx
          .insert(nodes)
          .values({
            userId,
            parentId,
            type: n.type,
            name: n.name,
            sortKey,
            priorityLetter: n.priority.letter,
            priorityRank: n.priority.rank,
            tcPriorityLetter: n.tcPriority.letter,
            tcPriorityRank: n.tcPriority.rank,
            state: n.state,
            focus: n.focus,
            collapsed: n.collapsed,
            notes: n.notes,
            deadline: n.deadline,
            targetStartDate: n.targetStart,
            targetEndDate: n.targetEnd,
            deferredDate,
            completedAt: n.completedAt,
            externalSource: ACHIEVE_EXTERNAL_SOURCE,
            externalId: n.achId,
          })
          .returning({ id: nodes.id });

        idByAch.set(n.achId, row.id);
        created++;

        if (n.type === "task") {
          await tx.insert(taskDetails).values({
            nodeId: row.id,
            effortMinutes: n.effortMinutes,
            effortLeftMinutes: n.effortLeftMinutes,
            actualEffortMinutes: n.actualEffortMinutes ?? 0,
            percentComplete: n.percentComplete ?? 0,
            description: n.description,
            place: n.place,
            dateCompleted: n.completedAt,
          });
        } else if (n.type === "project") {
          await tx.insert(projectDetails).values({
            nodeId: row.id,
            purpose: n.purpose,
            strategy: n.strategy,
            place: n.place,
            description: n.description,
            blockSizeMinutes: n.blockSizeMinutes,
            timePerWeekMinutes: n.timePerWeekMinutes,
            onlyShowNextTask: n.onlyShowNextTask,
          });
        } else if (n.type === "result_area") {
          await tx.insert(resultAreaDetails).values({
            nodeId: row.id,
            category: n.categoryName,
            description: n.description,
            importance: n.importance,
            reason: n.importanceReason,
            mission: n.mission,
            idealOuterVision: n.idealOuterVision,
            idealInnerVision: n.idealInnerVision,
            strengths: n.strengths,
            weaknesses: n.weaknesses,
            opportunities: n.opportunities,
            threats: n.threats,
          });
        } else if (n.type === "goal") {
          await tx.insert(goalDetails).values({
            nodeId: row.id,
            isDream: n.isDream,
            definition: n.definition,
            purpose: n.purpose,
            vision: n.vision,
            kindOfPerson: n.kindOfPerson,
            personalChanges: n.personalChanges,
            baseline: n.baseline,
            limitingFactor: n.limitingFactor,
            values: n.values,
            question: n.question,
            affirmation: n.affirmation,
            range: n.range,
            strategy: n.strategy,
            progressReview: n.progressReview,
            scorecard: n.scorecard,
            plannedStart: n.targetStart,
          });
        }
      }

      remaining.length = 0;
      remaining.push(...rest);
    }

    // Goals that Achieve only linked via ProjectId: hang the project under the goal.
    for (const n of mapped.nodes) {
      if (n.type !== "goal" || !n.linkedProjectAchId) continue;
      const goalId = idByAch.get(n.achId);
      const projectId = idByAch.get(n.linkedProjectAchId);
      if (!goalId || !projectId) continue;
      try {
        assertCanNest("project", "goal");
      } catch {
        continue;
      }
      await tx
        .update(nodes)
        .set({ parentId: goalId, updatedAt: new Date() })
        .where(and(eq(nodes.id, projectId), eq(nodes.userId, userId)));
    }

    return {
      created,
      counts: mapped.counts,
      warnings,
      skippedTables: mapped.skippedTables,
    };
  });
}
