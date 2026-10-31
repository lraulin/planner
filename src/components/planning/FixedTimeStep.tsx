"use client";

import type { WeeklyPlan } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { SchedulePayload } from "@/lib/schedule/queries";
import type { WeeklyPlanPatch } from "@/lib/planning/mutations";
import { draftFromCalendarSelect } from "@/lib/schedule/allDay";
import { asyncHandler } from "@/lib/eventHandler";
import { createTimeChartAction } from "@/app/(shell)/schedule/actions";
import { WeekCalendar } from "@/components/schedule/WeekCalendar";
import { AppointmentDrawer } from "@/components/schedule/AppointmentDrawer";
import { useStepCalendar } from "./useStepCalendar";

type Props = {
  plan: WeeklyPlan;
  schedule: SchedulePayload;
  nodes: OutlineNode[];
  weekKey: string;
  onPatchPlan: (patch: WeeklyPlanPatch) => Promise<void>;
  onScheduleChange: () => void;
  onError: (message: string) => void;
};

/**
 * Step 3 — pick the week's Time Chart and block off fixed commitments on the grid.
 * Reuses the same calendar + drawer as the Weekly Schedule so the interaction is identical.
 */
export function FixedTimeStep({
  plan,
  schedule,
  nodes,
  weekKey,
  onPatchPlan,
  onScheduleChange,
  onError,
}: Props) {
  const {
    week,
    charts,
    selectedChartId: payloadChartId,
    occurrences,
    backgroundEvents,
    editing,
    setEditing,
    handleCycleCheck,
    handleEventDrop,
    openOccurrence,
    handleDelete,
  } = useStepCalendar({ schedule, weekKey, onScheduleChange, onError });

  const selectedChartId = plan.timeChartId ?? payloadChartId;

  async function selectChart(id: string) {
    await onPatchPlan({ timeChartId: id || null });
    onScheduleChange();
  }

  async function handleNewChart() {
    const name = window.prompt("Time Chart name", "New Time Chart");
    if (name == null) return;
    const result = await createTimeChartAction(name);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    if (result.id) await selectChart(result.id);
    onScheduleChange();
  }

  function handleCreateRange(start: Date, end: Date, allDay: boolean) {
    setEditing({ subject: "", ...draftFromCalendarSelect(start, end, allDay) });
  }

  return (
    <div className="flex h-full min-h-[28rem] flex-col">
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-rule px-3 py-2 text-[0.8125rem]">
        <label className="flex items-center gap-1.5 text-ink-muted">
          Time Chart:
          <select
            className="rounded border border-rule bg-surface px-2 py-1 text-ink"
            value={selectedChartId ?? ""}
            onChange={(e) => void selectChart(e.target.value)}
          >
            <option value="">(none)</option>
            {charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || "Untitled"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded border border-rule bg-surface px-2 py-1 text-ink hover:bg-surface-raised"
          onClick={asyncHandler(handleNewChart, onError)}
        >
          New…
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <WeekCalendar
          days={week.days}
          rangeStart={week.start}
          rangeEnd={week.end}
          backgroundEvents={backgroundEvents}
          occurrences={occurrences}
          onSelectRange={handleCreateRange}
          onEventClick={openOccurrence}
          onEventDrop={asyncHandler(handleEventDrop, onError)}
          onExternalDrop={() => undefined}
          onCycleCheck={asyncHandler(handleCycleCheck, onError)}
        />
      </div>

      <AppointmentDrawer
        open={editing != null}
        value={editing}
        nodes={nodes}
        onClose={() => setEditing(null)}
        onSaved={() => {
          onScheduleChange();
        }}
        onDelete={asyncHandler(handleDelete, onError)}
      />
    </div>
  );
}
