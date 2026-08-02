import { db } from "@/db";
import {
  appointments,
  goalDetails,
  nodeItems,
  nodes,
  notes,
  projectDetails,
  resultAreaDetails,
  taskDetails,
  timeChartAreas,
  timeCharts,
} from "@/db/schema";
import type { NodeType } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { assertCanNest } from "@/lib/tree/hierarchy";
import { between } from "@/lib/tree/sortKey";
import { mapExtras, type AchExtrasMap } from "./mapExtras";
import { mapOutline } from "./mapOutline";
import { parseAchXml } from "./parseXml";
import type { AchMappedNode, AchOutlineMap } from "./types";

/** Provenance tag on every row written from Achieve XML. */
export const ACHIEVE_EXTERNAL_SOURCE = "achieve";

export type ImportMode = "merge" | "replace";

export type ImportExtraCounts = {
  appointments: number;
  timeCharts: number;
  timeChartAreas: number;
  wishes: number;
  notes: number;
};

export type ImportResult = {
  created: number;
  counts: Record<NodeType, number>;
  extras: ImportExtraCounts;
  warnings: string[];
  skippedTables: string[];
};

/**
 * Parse Achieve Full XML and write outline + calendar/wish/notes extras.
 *
 * - **replace** — deletes this user's outline nodes, appointments, time charts, and notes.
 * - **merge** — appends; may duplicate if the same file is imported twice.
 */
export async function importAchieveXml(params: {
  userId: string;
  xml: string;
  mode: ImportMode;
}): Promise<ImportResult> {
  const { userId, xml, mode } = params;
  const doc = parseAchXml(xml);
  const mapped = mapOutline(doc);
  const extras = mapExtras(doc);
  return writeMappedImport({ userId, mapped, extras, mode });
}

/** Insert an already-mapped outline (tests can build one without XML). */
export async function writeMappedOutline(params: {
  userId: string;
  mapped: AchOutlineMap;
  mode: ImportMode;
}): Promise<ImportResult> {
  return writeMappedImport({
    userId: params.userId,
    mapped: params.mapped,
    extras: emptyExtras(),
    mode: params.mode,
  });
}

export async function writeMappedImport(params: {
  userId: string;
  mapped: AchOutlineMap;
  extras: AchExtrasMap;
  mode: ImportMode;
}): Promise<ImportResult> {
  const { userId, mapped, extras, mode } = params;
  const warnings = [...mapped.warnings, ...extras.warnings];

  return db.transaction(async (tx) => {
    if (mode === "replace") {
      // Order: areas → charts; notes; appointments; nodes last (children cascade).
      await tx.delete(timeChartAreas).where(eq(timeChartAreas.userId, userId));
      await tx.delete(timeCharts).where(eq(timeCharts.userId, userId));
      await tx.delete(notes).where(eq(notes.userId, userId));
      await tx.delete(appointments).where(eq(appointments.userId, userId));
      await tx.delete(nodes).where(eq(nodes.userId, userId));
    }

    const idByAch = new Map<string, string>();
    const typeByAch = new Map<string, NodeType>();
    for (const n of mapped.nodes) {
      typeByAch.set(n.achId, n.type);
    }

    const remaining = [...mapped.nodes];
    let created = 0;
    const lastKeyByParent = new Map<string | null, string | null>();

    while (remaining.length > 0) {
      const batch: AchMappedNode[] = [];
      const rest: AchMappedNode[] = [];

      for (const n of remaining) {
        if (!n.parentAchId || idByAch.has(n.parentAchId)) {
          batch.push(n);
        } else if (!typeByAch.has(n.parentAchId)) {
          warnings.push(
            `${n.type} "${n.name}" parent ${n.parentAchId} not in file; imported at root`,
          );
          batch.push({ ...n, parentAchId: null });
        } else {
          rest.push(n);
        }
      }

      if (batch.length === 0) {
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

    const extraCounts = await writeExtras(tx, userId, idByAch, extras, warnings);

    return {
      created,
      counts: mapped.counts,
      extras: extraCounts,
      warnings,
      skippedTables: mapped.skippedTables,
    };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeExtras(
  tx: Tx,
  userId: string,
  idByAch: Map<string, string>,
  extras: AchExtrasMap,
  warnings: string[],
): Promise<ImportExtraCounts> {
  let appointmentsN = 0;
  let timeChartsN = 0;
  let timeChartAreasN = 0;
  let wishesN = 0;
  let notesN = 0;

  // Wishes without ResultAreaId hang off the first imported result area.
  const [anyRa] = await tx
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.userId, userId), eq(nodes.type, "result_area")))
    .limit(1);
  const wishHostFallback = anyRa?.id ?? null;

  for (const a of extras.appointments) {
    const projectId = a.projectAchId ? (idByAch.get(a.projectAchId) ?? null) : null;
    await tx.insert(appointments).values({
      userId,
      subject: a.subject,
      location: a.location,
      startAt: a.startAt,
      endAt: a.endAt,
      allDay: a.allDay,
      checkState: a.checkState,
      reminderMinutes: a.reminderMinutes,
      showAs: a.showAs,
      priorityLetter: a.priority.letter,
      priorityRank: a.priority.rank,
      projectId,
      notes: a.notes,
      private: a.private,
      externalSource: ACHIEVE_EXTERNAL_SOURCE,
      externalId: a.achId,
    });
    appointmentsN++;
  }

  for (const chart of extras.timeCharts) {
    const [created] = await tx
      .insert(timeCharts)
      .values({ userId, name: chart.name || "Time Chart" })
      .returning({ id: timeCharts.id });
    timeChartsN++;

    for (const area of chart.areas) {
      const resultAreaId = area.resultAreaAchId
        ? (idByAch.get(area.resultAreaAchId) ?? null)
        : null;
      await tx.insert(timeChartAreas).values({
        userId,
        timeChartId: created.id,
        name: area.name,
        resultAreaId,
        daysOfWeek: area.daysOfWeek,
        startMinute: area.startMinute,
        durationMinutes: area.durationMinutes,
        labelEnabled: true,
        foreColor: area.foreColor,
        backColor: area.backColor,
        description: area.description,
      });
      timeChartAreasN++;
    }
  }

  // Wishes: sort keys per (host, kind)
  const wishKey = new Map<string, string | null>();
  const sortedWishes = [...extras.wishes].sort((a, b) => a.ordinal - b.ordinal);
  for (const w of sortedWishes) {
    let hostId = w.resultAreaAchId ? idByAch.get(w.resultAreaAchId) : undefined;
    if (!hostId) hostId = wishHostFallback ?? undefined;
    if (!hostId) {
      warnings.push(`Wish "${w.title}" has no result area to attach to; skipped`);
      continue;
    }
    const keyId = `${hostId}:${w.kind}`;
    const prev = wishKey.get(keyId) ?? null;
    const sortKey = between(prev, null);
    wishKey.set(keyId, sortKey);
    await tx.insert(nodeItems).values({
      userId,
      nodeId: hostId,
      kind: w.kind,
      sortKey,
      title: w.title,
      description: w.description,
      purpose: w.purpose,
      priorityLetter: w.priority.letter,
      priorityRank: w.priority.rank,
    });
    wishesN++;
  }

  // Notes with parent links
  const noteIdByAch = new Map<string, string>();
  const remainingNotes = [...extras.notes];
  const lastNoteKey = new Map<string | null, string | null>();

  while (remainingNotes.length > 0) {
    const batch = [];
    const rest = [];
    for (const n of remainingNotes) {
      if (!n.parentAchId || noteIdByAch.has(n.parentAchId)) batch.push(n);
      else if (!extras.notes.some((x) => x.achId === n.parentAchId)) {
        warnings.push(`Note "${n.title}" parent missing; imported at root`);
        batch.push({ ...n, parentAchId: null });
      } else rest.push(n);
    }
    if (batch.length === 0) {
      for (const n of rest) {
        warnings.push(`Note "${n.title}" could not resolve parent; imported at root`);
        batch.push({ ...n, parentAchId: null });
      }
      rest.length = 0;
    }
    batch.sort((a, b) => a.ordinal - b.ordinal);
    for (const n of batch) {
      const parentId = n.parentAchId ? (noteIdByAch.get(n.parentAchId) ?? null) : null;
      const prev = lastNoteKey.get(parentId) ?? null;
      const sortKey = between(prev, null);
      lastNoteKey.set(parentId, sortKey);
      const [row] = await tx
        .insert(notes)
        .values({
          userId,
          parentId,
          sortKey,
          title: n.title,
          subject: n.subject,
          body: n.body,
          noteDate: n.noteDate,
          flag: n.flag,
          collapsed: n.collapsed,
        })
        .returning({ id: notes.id });
      noteIdByAch.set(n.achId, row.id);
      notesN++;
    }
    remainingNotes.length = 0;
    remainingNotes.push(...rest);
  }

  return {
    appointments: appointmentsN,
    timeCharts: timeChartsN,
    timeChartAreas: timeChartAreasN,
    wishes: wishesN,
    notes: notesN,
  };
}

function emptyExtras(): AchExtrasMap {
  return {
    appointments: [],
    timeCharts: [],
    wishes: [],
    notes: [],
    warnings: [],
  };
}
