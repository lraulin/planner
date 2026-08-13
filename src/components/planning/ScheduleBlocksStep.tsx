"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Draggable } from "@fullcalendar/interaction";
import type { Appointment, WeeklyPlan } from "@/db/schema";
import type { SchedulePayload } from "@/lib/schedule/queries";
import type { Occurrence } from "@/lib/schedule/recurrence";
import type { WeeklyPlanPatch } from "@/lib/planning/mutations";
import {
  findFreeSlot,
  nextBlockSize,
  remainingMinutesForProject,
  scheduledMinutesForProject,
} from "@/lib/planning/blocks";
import { selectProjectsForCommitment } from "@/lib/planning/review";
import { atMinutes, fromDateKey, parseFloatingDateTime } from "@/lib/schedule/geometry";
import { weekRange } from "@/lib/schedule/range";
import { formatEffort } from "@/lib/tree/format";
import { asyncHandler } from "@/lib/eventHandler";
import {
  createAppointmentAction,
  deleteAppointmentAction,
  rescheduleAppointmentAction,
  setAppointmentCheckStateAction,
  duplicateAppointmentAction,
} from "@/app/schedule/actions";
import type { AppointmentCheck } from "@/db/schema";
import { WeekCalendar } from "@/components/schedule/WeekCalendar";
import { AppointmentDrawer } from "@/components/schedule/AppointmentDrawer";
import { TypeIcon } from "@/components/icons/TypeIcon";
import type { DraftAppointment } from "@/components/schedule/ScheduleView";
import type { StepContext } from "./types";

const BLOCK_SIZES = [30, 45, 60, 90, 120, 180];

type Props = {
  ctx: StepContext;
  plan: WeeklyPlan;
  schedule: SchedulePayload;
  weekKey: string;
  onPatchPlan: (patch: WeeklyPlanPatch) => Promise<void>;
  onScheduleChange: () => void;
  onError: (message: string) => void;
};

function hydrate(schedule: SchedulePayload) {
  return {
    charts: schedule.charts,
    backgroundEvents: schedule.backgroundEvents.map((e) => ({
      ...e,
      start: parseFloatingDateTime(e.start),
      end: parseFloatingDateTime(e.end),
    })),
    occurrences: schedule.occurrences.map((o) => ({
      ...o,
      startAt: new Date(o.startAt),
      endAt: new Date(o.endAt),
    })),
    masters: schedule.appointments.map((a) => ({
      ...a,
      startAt: new Date(a.startAt),
      endAt: new Date(a.endAt),
      recurrenceUntil: a.recurrenceUntil ? new Date(a.recurrenceUntil) : null,
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.updatedAt),
    })),
  };
}

/**
 * Step 5 — drag committed projects onto the week until remaining time hits zero.
 * Avoid Collisions slides a drop to the next free slot within the day.
 */
export function ScheduleBlocksStep({
  ctx,
  plan,
  schedule,
  weekKey,
  onPatchPlan,
  onScheduleChange,
  onError,
}: Props) {
  // The wizard is always about one whole week, whatever width the calendar tab is on.
  const week = weekRange(fromDateKey(weekKey));
  const hydrated = hydrate(schedule);
  const [occurrences, setOccurrences] = useState(hydrated.occurrences);
  const [masters, setMasters] = useState(hydrated.masters);
  const [backgroundEvents] = useState(hydrated.backgroundEvents);
  const [editing, setEditing] = useState<Appointment | DraftAppointment | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [prevSchedule, setPrevSchedule] = useState(schedule);
  if (schedule !== prevSchedule) {
    setPrevSchedule(schedule);
    const next = hydrate(schedule);
    setOccurrences(next.occurrences);
    setMasters(next.masters);
  }

  const committedProjects = useMemo(() => {
    const leaf = selectProjectsForCommitment(ctx.nodes);
    return leaf.filter((p) => {
      const committed = ctx.entryFor(p.id).committedMinutes;
      return committed != null && committed > 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.nodes, ctx.entries]);

  const remainingById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const p of committedProjects) {
      const committed = ctx.entryFor(p.id).committedMinutes;
      const scheduled = scheduledMinutesForProject(
        occurrences.map((o) => ({
          projectId: o.projectId,
          startAt: o.startAt,
          endAt: o.endAt,
        })),
        p.id,
      );
      map.set(p.id, remainingMinutesForProject(committed, scheduled));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedProjects, occurrences, ctx.entries]);

  // External drag source for FullCalendar (same pattern as ProjectsRail).
  useEffect(() => {
    if (!listRef.current) return;
    const draggable = new Draggable(listRef.current, {
      itemSelector: "[data-project-id]",
      eventData(el) {
        const projectId = el.getAttribute("data-project-id") ?? "";
        const remaining = remainingById.get(projectId);
        const duration = nextBlockSize(
          remaining === undefined ? null : remaining,
          plan.blockSizeMinutes,
        );
        return {
          title: el.getAttribute("data-project-name") ?? "Project",
          duration: { minutes: duration },
          create: true,
          extendedProps: {
            projectId,
            durationMinutes: duration,
          },
        };
      },
    });
    return () => draggable.destroy();
  }, [remainingById, plan.blockSizeMinutes]);

  const busyIntervals = useMemo(() => {
    const fromAppts = occurrences.map((o) => ({ start: o.startAt, end: o.endAt }));
    if (!plan.avoidCollisions) return fromAppts;
    // Also treat Time Chart background as busy when avoiding collisions — optional
    // enrichment over Achieve, called out in the spec.
    const fromChart = backgroundEvents.map((e) => ({ start: e.start, end: e.end }));
    return [...fromAppts, ...fromChart];
  }, [occurrences, backgroundEvents, plan.avoidCollisions]);

  async function handleExternalDrop(
    projectId: string,
    projectName: string,
    start: Date,
    durationMinutes: number,
  ) {
    let dropStart = start;
    if (plan.avoidCollisions) {
      const dayEnd = atMinutes(start, 24 * 60);
      const free = findFreeSlot(busyIntervals, start, durationMinutes, {
        searchEnd: dayEnd,
        stepMinutes: 15,
      });
      if (!free) {
        onError("No free slot left on that day for this block.");
        return;
      }
      dropStart = free;
    }

    const end = new Date(dropStart.getTime() + durationMinutes * 60_000);
    const result = await createAppointmentAction({
      subject: projectName,
      startAt: dropStart.toISOString(),
      endAt: end.toISOString(),
      projectId,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onScheduleChange();
  }

  function handleCreateRange(start: Date, end: Date) {
    if (!selectedProjectId) {
      setEditing({ subject: "", startAt: start, endAt: end });
      return;
    }
    const project = committedProjects.find((p) => p.id === selectedProjectId);
    if (!project) {
      setEditing({ subject: "", startAt: start, endAt: end });
      return;
    }
    const remaining = remainingById.get(project.id) ?? null;
    const duration = nextBlockSize(remaining, plan.blockSizeMinutes);
    // Prefer click-to-place at the selected project's next block size.
    void handleExternalDrop(
      project.id,
      project.name || "Project",
      start,
      Math.max(
        duration,
        Math.round((end.getTime() - start.getTime()) / 60_000) || duration,
      ),
    );
  }

  const handleCycleCheck = useCallback(
    async (id: string, next: AppointmentCheck) => {
      setOccurrences((prev) =>
        prev.map((o) => (o.id === id ? { ...o, checkState: next } : o)),
      );
      const result = await setAppointmentCheckStateAction(id, next);
      if (!result.ok) {
        onError(result.error);
        onScheduleChange();
        return;
      }
      onScheduleChange();
    },
    [onError, onScheduleChange],
  );

  async function handleEventDrop(
    id: string,
    start: Date,
    end: Date,
    opts: { duplicate: boolean },
  ) {
    if (opts.duplicate) {
      const result = await duplicateAppointmentAction(
        id,
        start.toISOString(),
        end.toISOString(),
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }
    } else {
      const result = await rescheduleAppointmentAction(
        id,
        start.toISOString(),
        end.toISOString(),
        true,
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }
    }
    onScheduleChange();
  }

  function openOccurrence(occ: Occurrence) {
    const master = masters.find((m) => m.id === occ.id);
    if (master) setEditing(master);
    else {
      setEditing({
        id: occ.id,
        subject: occ.subject,
        startAt: occ.startAt,
        endAt: occ.endAt,
        projectId: occ.projectId,
      });
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteAppointmentAction(id);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setEditing(null);
    onScheduleChange();
  }

  const selectedRemaining = selectedProjectId
    ? remainingById.get(selectedProjectId)
    : null;

  return (
    <div className="flex h-full min-h-[28rem] flex-col">
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-rule px-3 py-2 text-[0.8125rem]">
        <label className="flex items-center gap-1.5 text-ink-muted">
          Block Size:
          <select
            className="rounded border border-rule bg-surface px-2 py-1 text-ink"
            value={plan.blockSizeMinutes}
            onChange={(e) =>
              void onPatchPlan({ blockSizeMinutes: Number(e.target.value) })
            }
          >
            {BLOCK_SIZES.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-ink">
          <input
            type="checkbox"
            checked={plan.avoidCollisions}
            onChange={(e) => void onPatchPlan({ avoidCollisions: e.target.checked })}
          />
          Avoid Collisions
        </label>
        {selectedProjectId && (
          <span className="ml-auto tabular text-ink-muted">
            Time Remaining:{" "}
            <strong className="text-ink">
              {selectedRemaining == null ? "—" : formatEffort(selectedRemaining) || "0"}
            </strong>
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          <WeekCalendar
            days={week.days}
            rangeStart={week.start}
            rangeEnd={week.end}
            backgroundEvents={backgroundEvents}
            occurrences={occurrences}
            onSelectRange={handleCreateRange}
            onEventClick={openOccurrence}
            onEventDrop={asyncHandler(handleEventDrop, onError)}
            onExternalDrop={asyncHandler(handleExternalDrop, onError)}
            onCycleCheck={asyncHandler(handleCycleCheck, onError)}
          />
        </div>

        <aside className="flex w-56 flex-none flex-col border-l border-rule bg-shell">
          <div className="border-b border-rule px-2 py-1.5 text-[0.8125rem] font-medium text-ink">
            Commitments
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
            {committedProjects.length === 0 ? (
              <p className="p-2 text-[0.75rem] text-ink-faint">
                Commit time to projects in Step 4, then drag them here.
              </p>
            ) : (
              committedProjects.map((p) => {
                const remaining = remainingById.get(p.id) ?? null;
                const done = remaining != null && remaining <= 0;
                const duration = nextBlockSize(remaining, plan.blockSizeMinutes);
                return (
                  <div
                    key={p.id}
                    data-project-id={p.id}
                    data-project-name={p.name || "Untitled"}
                    data-duration={duration}
                    role="button"
                    tabIndex={0}
                    className={`flex cursor-grab items-start gap-1.5 border-b border-rule px-2 py-1.5 text-[0.8125rem] active:cursor-grabbing ${
                      selectedProjectId === p.id
                        ? "bg-select"
                        : "hover:bg-surface-raised"
                    } ${done ? "opacity-50" : ""}`}
                    onClick={() => setSelectedProjectId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedProjectId(p.id);
                      }
                    }}
                  >
                    <TypeIcon kind="project" className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-ink">{p.name || "Untitled"}</div>
                      <div className="tabular text-[0.75rem] text-ink-faint">
                        {remaining == null
                          ? "—"
                          : remaining <= 0
                            ? "Done"
                            : `${formatEffort(remaining)} left`}
                        {" · "}
                        {duration}m blocks
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      <AppointmentDrawer
        open={editing != null}
        value={editing}
        nodes={ctx.nodes}
        onClose={() => setEditing(null)}
        onSaved={() => {
          onScheduleChange();
        }}
        onDelete={asyncHandler(handleDelete, onError)}
      />
    </div>
  );
}
