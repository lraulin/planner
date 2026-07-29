"use client";

import type { TimeChartArea } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { WEEKDAY_LABELS, WEEKDAYS, WEEKDAYS_ONLY } from "@/lib/schedule/geometry";

const PRESET_COLORS = [
  "#c8e0f0",
  "#90ee90",
  "#ffb6c1",
  "#fff59d",
  "#d1c4e9",
  "#ffcc80",
  "#b3e5fc",
  "#000080",
  "#2e7d32",
  "#c62828",
];

type Props = {
  area: TimeChartArea | null;
  nodes: OutlineNode[];
  onChange: (patch: Partial<TimeChartArea>) => void;
  onDelete: () => void;
  nameInputRef?: React.RefObject<HTMLInputElement | null>;
};

export function TimeChartAreaPanel({
  area,
  nodes,
  onChange,
  onDelete,
  nameInputRef,
}: Props) {
  const resultAreas = nodes.filter((n) => n.type === "result_area" && !n.hidden);

  if (!area) {
    return (
      <div className="p-3 text-[0.8125rem] text-ink-muted">
        <p className="font-medium text-ink">Area details</p>
        <p className="mt-2 text-ink-faint">
          Click and drag on the week to create a block, then type a name. Click an
          existing block to edit multi-day presets and colors.
        </p>
      </div>
    );
  }

  const days = area.daysOfWeek;

  function toggleDay(d: number) {
    const next = days.includes(d)
      ? days.filter((x) => x !== d)
      : [...days, d].sort((a, b) => a - b);
    if (next.length === 0) return;
    onChange({ daysOfWeek: next });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-rule px-3 py-2 text-[0.8125rem] font-semibold text-ink">
        Area
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[0.8125rem]">
        <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Name
          <input
            ref={nameInputRef}
            className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
            value={area.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Sleep, Deep Work"
          />
        </label>

        <div>
          <div className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Days
          </div>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded border border-rule px-1.5 py-0.5 text-[0.75rem] text-ink hover:bg-surface-raised"
              onClick={() => onChange({ daysOfWeek: [...WEEKDAYS] })}
            >
              Every day
            </button>
            <button
              type="button"
              className="rounded border border-rule px-1.5 py-0.5 text-[0.75rem] text-ink hover:bg-surface-raised"
              onClick={() => onChange({ daysOfWeek: [...WEEKDAYS_ONLY] })}
            >
              Weekdays
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, d) => (
              <label
                key={label}
                className="flex items-center gap-1 text-[0.8125rem] text-ink"
              >
                <input
                  type="checkbox"
                  checked={days.includes(d)}
                  onChange={() => toggleDay(d)}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[0.75rem] text-ink-faint">
            Same time range on every selected day — no need to Ctrl+drag copies.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Result Area
          <select
            className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
            value={area.resultAreaId ?? ""}
            onChange={(e) => onChange({ resultAreaId: e.target.value || null })}
          >
            <option value="">(None)</option>
            {resultAreas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || "Untitled"}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-[0.8125rem] text-ink">
          <input
            type="checkbox"
            checked={area.labelEnabled}
            onChange={(e) => onChange({ labelEnabled: e.target.checked })}
          />
          Show label on chart
        </label>

        <div>
          <div className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Color
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={[
                  "h-6 w-6 rounded border",
                  area.backColor === c
                    ? "border-select-edge ring-1 ring-select-edge"
                    : "border-rule",
                ].join(" ")}
                style={{ background: c }}
                onClick={() => onChange({ backColor: c })}
              />
            ))}
            <input
              type="color"
              value={area.backColor}
              className="h-6 w-8 cursor-pointer"
              onChange={(e) => onChange({ backColor: e.target.value })}
            />
          </div>
        </div>

        <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Description
          <textarea
            className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
            rows={3}
            value={area.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </label>

        <button
          type="button"
          className="rounded border border-rule px-2 py-1.5 text-priority-a hover:bg-surface-raised"
          onClick={onDelete}
        >
          Delete area
        </button>
      </div>
    </div>
  );
}
