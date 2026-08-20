"use client";

import { Fragment } from "react";
import { formatDurationClock, parseDurationSeconds } from "@/lib/fitness/duration";
import { parseWeight } from "@/lib/fitness/format";
import { plateHint } from "@/lib/fitness/plates";
import { gridTemplate, type SetColumn } from "@/lib/fitness/setColumns";
import type { DraftSet } from "@/lib/fitness/sessionDraft";
import { bumpWeight, weightStep } from "@/lib/fitness/weightStep";
import { HoldTimer } from "./HoldTimer";

/**
 * One set's fields, laid out by the column list the catalog exercise derives. Shared by the
 * straight-set block and the round-major group view: inside a group the row is a member's
 * work for one round, which changes the label in the gutter and nothing else.
 */
export function SetHeader({ columns }: { columns: SetColumn[] }) {
  return (
    <div
      className="grid gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint"
      style={{ gridTemplateColumns: gridTemplate(columns) }}
    >
      {columns.map((column) => (
        <span key={column.key}>{column.label}</span>
      ))}
    </div>
  );
}

export function SetRow({
  index,
  indexLabel,
  set,
  columns,
  showPlates,
  barWeight,
  holdStartedAt,
  onStartHold,
  onStopHold,
  onChange,
  onRemove,
}: {
  index: number;
  /** Overrides the ordinal in the gutter — "A1" for a group member. */
  indexLabel?: string;
  set: DraftSet;
  columns: SetColumn[];
  showPlates: boolean;
  barWeight: number;
  /** Non-null while this row's stopwatch is running. */
  holdStartedAt: number | null;
  onStartHold: () => void;
  onStopHold: () => void;
  onChange: (patch: Partial<DraftSet>) => void;
  onRemove: () => void;
}) {
  const unit = set.unit || "lb";
  // The widest rows squeeze the number fields, exactly as the hand-written grids did.
  const numberClass = `min-w-0 rounded border border-rule bg-surface ${
    columns.length >= 6 ? "px-1.5" : "px-2"
  } py-1 font-mono text-[0.8125rem] text-ink`;

  const hold = parseDurationSeconds(set.duration);

  function cell(column: SetColumn) {
    switch (column.key) {
      case "index":
        return (
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {indexLabel ?? index + 1}
          </span>
        );

      case "reps":
        return (
          <input
            type="number"
            min={0}
            value={set.reps}
            onChange={(e) => onChange({ reps: e.target.value })}
            className={numberClass}
          />
        );

      case "repsLeft":
      case "repsRight": {
        const left = column.key === "repsLeft";
        return (
          <input
            type="number"
            min={0}
            value={left ? set.repsLeft : set.repsRight}
            onChange={(e) =>
              onChange(
                left ? { repsLeft: e.target.value } : { repsRight: e.target.value },
              )
            }
            placeholder={left ? "L" : "R"}
            className={numberClass}
          />
        );
      }

      case "duration":
        return (
          <div className="flex min-w-0 items-center gap-0.5">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={holdStartedAt == null ? set.duration : ""}
              onChange={(e) => onChange({ duration: e.target.value })}
              placeholder="sec"
              disabled={holdStartedAt != null}
              className={`${numberClass} flex-1`}
            />
            <HoldTimer
              startedAt={holdStartedAt}
              onStart={onStartHold}
              onStop={onStopHold}
            />
          </div>
        );

      case "weight":
        return (
          <div className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              title={`−${weightStep(unit)}`}
              onClick={() => onChange({ weight: bumpWeight(set.weight, unit, -1) })}
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded border border-rule bg-surface text-[0.75rem] text-ink-muted hover:text-ink"
            >
              −
            </button>
            <input
              type="number"
              min={0}
              step={weightStep(unit)}
              value={set.weight}
              onChange={(e) => onChange({ weight: e.target.value })}
              className="min-w-0 flex-1 rounded border border-rule bg-surface px-1.5 py-1 font-mono text-[0.8125rem] text-ink"
            />
            <button
              type="button"
              title={`+${weightStep(unit)}`}
              onClick={() => onChange({ weight: bumpWeight(set.weight, unit, 1) })}
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded border border-rule bg-surface text-[0.75rem] text-ink-muted hover:text-ink"
            >
              +
            </button>
          </div>
        );

      case "unit":
        return (
          <select
            value={set.unit === "bw" ? "lb" : set.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            className="rounded border border-rule bg-surface px-1 py-1 text-[0.75rem] text-ink"
          >
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
        );

      case "delete":
        return (
          <button
            type="button"
            onClick={onRemove}
            title="Delete set"
            className="flex h-7 w-7 items-center justify-center rounded text-ink-faint hover:bg-priority-a/10 hover:text-priority-a"
          >
            ×
          </button>
        );
    }
  }

  return (
    <div className="space-y-0.5">
      <div
        className="grid items-center gap-1"
        style={{ gridTemplateColumns: gridTemplate(columns) }}
      >
        {columns.map((column) => (
          <Fragment key={column.key}>{cell(column)}</Fragment>
        ))}
      </div>
      {showPlates && (
        <PlateLine weight={set.weight} unit={unit} barWeightLb={barWeight} />
      )}
      {/* Seconds are what you type; the clock is only worth showing past a minute. */}
      {hold != null && hold >= 60 && (
        <p className="pl-8 font-mono text-[0.6875rem] text-ink-faint">
          {formatDurationClock(hold)}
        </p>
      )}
    </div>
  );
}

function PlateLine({
  weight,
  unit,
  barWeightLb,
}: {
  weight: string;
  unit: string;
  barWeightLb: number;
}) {
  const hint = plateHint(parseWeight(weight), unit, barWeightLb);
  if (!hint) return null;
  return <p className="pl-8 font-mono text-[0.6875rem] text-ink-faint">{hint}</p>;
}
