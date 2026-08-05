"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WeeklyPlan, WeeklyPlanEntry } from "@/db/schema";
import type { WeeklyPlanPayload } from "@/lib/planning/queries";
import type { PlanEntryPatch, WeeklyPlanPatch } from "@/lib/planning/mutations";
import { fromDateKey, startOfWeek, toDateKey, weekDays } from "@/lib/schedule/geometry";
import { asyncHandler } from "@/lib/eventHandler";
import {
  setWeeklyPlanCompletedAction,
  startWeeklyPlanAction,
  updateWeeklyPlanAction,
  upsertPlanEntryAction,
  setFocusAreaAction,
  saveMissionAction,
} from "@/app/schedule/plan/actions";
import {
  EMPTY_ENTRY,
  STEP_HINTS,
  STEP_LABELS,
  type EntryValue,
  type StepContext,
} from "./types";
import { SelectWeekStep } from "./SelectWeekStep";
import { ResultAreasStep } from "./ResultAreasStep";
import { GoalsStep } from "./GoalsStep";
import { FixedTimeStep } from "./FixedTimeStep";
import { TimeBudgetStep } from "./TimeBudgetStep";
import { ScheduleBlocksStep } from "./ScheduleBlocksStep";

type Props = {
  payload: WeeklyPlanPayload;
  weekKey: string;
  step: number;
};

function entriesToMap(rows: WeeklyPlanEntry[]): Map<string, EntryValue> {
  const map = new Map<string, EntryValue>();
  for (const row of rows) {
    map.set(row.nodeId, {
      focus: row.focus,
      reviewed: row.reviewed,
      rewrite: row.rewrite,
      committedMinutes: row.committedMinutes,
    });
  }
  return map;
}

function weekRangeLabel(weekStart: Date): string {
  const days = weekDays(weekStart);
  const start = days[0].toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const end = days[6].toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

/**
 * Full-page weekly planning wizard. Steps are free to visit; the strip and Back/Next
 * share the same `?step=` URL so a refresh lands where you left off.
 */
export function WeeklyPlanView({ payload, weekKey, step }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const weekStart = fromDateKey(weekKey);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<WeeklyPlan | null>(payload.plan);
  const [entries, setEntries] = useState(() => entriesToMap(payload.entries));
  const [schedule, setSchedule] = useState(payload.schedule);

  // Sync when the server revalidates after a write. Adjust during render, not an effect.
  const [prevPayload, setPrevPayload] = useState(payload);
  if (payload !== prevPayload) {
    setPrevPayload(payload);
    setPlan(payload.plan);
    setEntries(entriesToMap(payload.entries));
    setSchedule(payload.schedule);
  }

  const resultAreaReviews = useMemo(
    () => new Map(payload.resultAreaReviews),
    [payload.resultAreaReviews],
  );
  const previousRewrites = useMemo(
    () => new Map(payload.previousRewrites),
    [payload.previousRewrites],
  );

  const reviewEnabled = plan?.reviewAreasGoals ?? true;

  /** Steps that exist for this run — skipping 1–2 when the review toggle is off. */
  const activeSteps = useMemo(() => {
    if (reviewEnabled) return [0, 1, 2, 3, 4, 5];
    return [0, 3, 4, 5];
  }, [reviewEnabled]);

  const clampedStep = activeSteps.includes(step) ? step : activeSteps[0];
  const stepIndex = activeSteps.indexOf(clampedStep);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const goToStep = useCallback(
    (
      nextStep: number,
      nextWeekKey = weekKey,
      weekStartsOn = plan?.weekStartsOn ?? 0,
    ) => {
      const start = weekStartsOn === 1 ? 1 : 0;
      router.push(`/schedule/plan?week=${nextWeekKey}&start=${start}&step=${nextStep}`);
    },
    [router, weekKey, plan?.weekStartsOn],
  );

  const goBack = useCallback(() => {
    if (stepIndex <= 0) {
      router.push(`/schedule?week=${weekKey}`);
      return;
    }
    goToStep(activeSteps[stepIndex - 1]);
  }, [stepIndex, activeSteps, goToStep, router, weekKey]);

  const goNext = useCallback(() => {
    if (stepIndex >= activeSteps.length - 1) return;
    goToStep(activeSteps[stepIndex + 1]);
  }, [stepIndex, activeSteps, goToStep]);

  const entryFor = useCallback(
    (nodeId: string): EntryValue => entries.get(nodeId) ?? EMPTY_ENTRY,
    [entries],
  );

  const patchEntry = useCallback(
    (nodeId: string, patch: PlanEntryPatch) => {
      if (!plan) return;
      setEntries((prev) => {
        const current = prev.get(nodeId) ?? EMPTY_ENTRY;
        const next = new Map(prev);
        next.set(nodeId, {
          focus: patch.focus ?? current.focus,
          reviewed: patch.reviewed ?? current.reviewed,
          rewrite: patch.rewrite ?? current.rewrite,
          committedMinutes:
            patch.committedMinutes !== undefined
              ? patch.committedMinutes
              : current.committedMinutes,
        });
        return next;
      });
      void upsertPlanEntryAction(plan.id, nodeId, patch).then((result) => {
        if (!result.ok) setError(result.error);
        else refresh();
      });
    },
    [plan, refresh, setError],
  );

  const patchPlan = useCallback(
    async (patch: WeeklyPlanPatch) => {
      if (!plan) return;
      setPlan((prev) => (prev ? { ...prev, ...patch, updatedAt: new Date() } : prev));
      const result = await updateWeeklyPlanAction(plan.id, patch);
      if (!result.ok) {
        setError(result.error);
        refresh();
        return;
      }
      refresh();
    },
    [plan, refresh, setError],
  );

  const handleStart = useCallback(
    async (input: {
      weekKey: string;
      weekStartsOn: number;
      reviewAreasGoals: boolean;
    }) => {
      setError(null);
      const result = await startWeeklyPlanAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const start = startOfWeek(fromDateKey(input.weekKey), input.weekStartsOn);
      const key = toDateKey(start);
      const firstStep = input.reviewAreasGoals ? 1 : 3;
      router.push(
        `/schedule/plan?week=${key}&start=${input.weekStartsOn}&step=${firstStep}`,
      );
      startTransition(() => router.refresh());
    },
    [router, setError],
  );

  const handleFinish = useCallback(async () => {
    if (!plan) return;
    setError(null);
    const result = await setWeeklyPlanCompletedAction(plan.id, true);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/schedule?week=${weekKey}`);
  }, [plan, router, weekKey, setError]);

  const handleSaveAndClose = useCallback(() => {
    router.push(`/schedule?week=${weekKey}`);
  }, [router, weekKey]);

  const handleFocus = useCallback(
    async (nodeId: string, focus: boolean) => {
      if (!plan) return;
      setEntries((prev) => {
        const current = prev.get(nodeId) ?? EMPTY_ENTRY;
        const next = new Map(prev);
        next.set(nodeId, { ...current, focus, reviewed: true });
        return next;
      });
      const result = await setFocusAreaAction(plan.id, nodeId, focus);
      if (!result.ok) {
        setError(result.error);
        refresh();
        return;
      }
      refresh();
    },
    [plan, refresh, setError],
  );

  const handleMission = useCallback(
    async (nodeId: string, mission: string) => {
      const result = await saveMissionAction(nodeId, mission);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      refresh();
    },
    [refresh, setError],
  );

  const stepContext: StepContext | null = plan
    ? {
        planId: plan.id,
        nodes: payload.nodes,
        entries,
        entryFor,
        patchEntry,
        resultAreaReviews,
        previousRewrites,
        onError: setError,
      }
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {/* Title + actions — Achieve's wizard chrome */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-rule bg-shell px-3 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-[0.9375rem] font-medium text-ink">
            Weekly Planning{" "}
            <span className="font-normal text-ink-muted">
              {weekRangeLabel(weekStart)}
            </span>
          </h1>
        </div>
        <button
          type="button"
          className="rounded border border-rule bg-surface px-2.5 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised"
          onClick={handleSaveAndClose}
        >
          Save and Close
        </button>
        {clampedStep === 5 && plan && (
          <button
            type="button"
            className="rounded border border-select-edge bg-select px-2.5 py-1 text-[0.8125rem] font-medium text-ink hover:opacity-90"
            onClick={asyncHandler(handleFinish, setError)}
          >
            Finish
          </button>
        )}
      </div>

      {/* Step strip — scrolls rather than wrapping below `md`, so the seven steps stay on
          one line and the wizard's content keeps the height. */}
      <div className="flex flex-none flex-nowrap items-center gap-1 overflow-x-auto border-b border-rule bg-shell px-3 py-1.5 md:flex-wrap md:overflow-x-visible">
        {activeSteps.map((s) => {
          const active = s === clampedStep;
          return (
            <button
              key={s}
              type="button"
              disabled={s > 0 && !plan}
              className={`min-h-tap flex-none rounded px-2.5 py-1 text-[0.8125rem] whitespace-nowrap md:min-h-0 ${
                active
                  ? "bg-select font-medium text-ink ring-1 ring-select-edge"
                  : "text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-40"
              }`}
              onClick={() => goToStep(s)}
            >
              <span className="tabular">{s === 0 ? "Week" : `Step ${s}`}</span>
              <span className="ml-1.5 hidden text-ink-muted sm:inline">
                {STEP_LABELS[s]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="flex-none border-b border-rule bg-surface-raised px-3 py-1.5 text-[0.8125rem] text-ink-muted">
        {STEP_HINTS[clampedStep]}
      </p>

      {error && (
        <div
          role="alert"
          className="flex-none border-b border-priority-a/40 bg-priority-a/10 px-3 py-1.5 text-[0.8125rem] text-priority-a"
        >
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {clampedStep === 0 && (
          <SelectWeekStep
            weekKey={weekKey}
            weekStartsOn={plan?.weekStartsOn ?? payload.weekStartsOn}
            reviewAreasGoals={plan?.reviewAreasGoals ?? true}
            hasPlan={plan != null}
            onStart={handleStart}
            onUpdateReview={
              plan ? (value) => void patchPlan({ reviewAreasGoals: value }) : undefined
            }
          />
        )}
        {clampedStep === 1 && stepContext && (
          <ResultAreasStep
            ctx={stepContext}
            onFocus={handleFocus}
            onMission={handleMission}
          />
        )}
        {clampedStep === 2 && stepContext && <GoalsStep ctx={stepContext} />}
        {clampedStep === 3 && plan && (
          <FixedTimeStep
            plan={plan}
            schedule={schedule}
            nodes={payload.nodes}
            weekKey={weekKey}
            onPatchPlan={patchPlan}
            onScheduleChange={() => refresh()}
            onError={setError}
          />
        )}
        {clampedStep === 4 && stepContext && plan && (
          <TimeBudgetStep
            ctx={stepContext}
            availableMinutes={plan.availableMinutes}
            resources={payload.resources}
            onAvailableChange={(minutes) =>
              void patchPlan({ availableMinutes: minutes })
            }
          />
        )}
        {clampedStep === 5 && stepContext && plan && (
          <ScheduleBlocksStep
            ctx={stepContext}
            plan={plan}
            schedule={schedule}
            weekKey={weekKey}
            onPatchPlan={patchPlan}
            onScheduleChange={() => refresh()}
            onError={setError}
          />
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex flex-none items-center justify-between border-t border-rule bg-shell px-3 py-2">
        <button
          type="button"
          className="rounded border border-rule bg-surface px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised"
          onClick={goBack}
        >
          {stepIndex <= 0 ? "Cancel" : "Back"}
        </button>
        <span className="text-[0.75rem] tabular text-ink-faint">
          {stepIndex + 1} of {activeSteps.length}
        </span>
        {stepIndex < activeSteps.length - 1 ? (
          <button
            type="button"
            disabled={clampedStep === 0 && !plan}
            className="rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] font-medium text-ink hover:opacity-90 disabled:opacity-40"
            onClick={goNext}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] font-medium text-ink hover:opacity-90"
            onClick={asyncHandler(handleFinish, setError)}
          >
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
