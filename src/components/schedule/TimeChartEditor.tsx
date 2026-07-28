"use client";

import { useEffect, useState } from "react";
import type { TimeChartArea } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { Drawer } from "@/components/detail/Drawer";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import {
  createTimeChartAreaAction,
  deleteTimeChartAreaAction,
  renameTimeChartAction,
  updateTimeChartAreaAction,
} from "@/app/schedule/actions";
import { WEEKDAY_LABELS, WEEKDAYS, WEEKDAYS_ONLY } from "@/lib/schedule/geometry";

type Props = {
  open: boolean;
  chartId: string;
  chartName: string;
  areas: TimeChartArea[];
  nodes: OutlineNode[];
  onClose: () => void;
  onChanged: () => void;
};

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

function minutesToTimeInput(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeInputToMinutes(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function TimeChartEditor({
  open,
  chartId,
  chartName,
  areas,
  nodes,
  onClose,
  onChanged,
}: Props) {
  const [name, setName] = useState(chartName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [areaName, setAreaName] = useState("");
  const [days, setDays] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState("09:00");
  const [durationHours, setDurationHours] = useState(1);
  const [backColor, setBackColor] = useState("#c8e0f0");
  const [foreColor, setForeColor] = useState("#1b1d23");
  const [labelEnabled, setLabelEnabled] = useState(true);
  const [resultAreaId, setResultAreaId] = useState("");
  const [description, setDescription] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resultAreas = nodes.filter((n) => n.type === "result_area" && !n.hidden);
  const selected = areas.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    setName(chartName);
  }, [chartName]);

  useEffect(() => {
    if (!selected) {
      // New area defaults
      return;
    }
    setAreaName(selected.name);
    setDays(selected.daysOfWeek.length ? selected.daysOfWeek : [0]);
    setStartTime(minutesToTimeInput(selected.startMinute));
    setDurationHours(selected.durationMinutes / 60);
    setBackColor(selected.backColor);
    setForeColor(selected.foreColor);
    setLabelEnabled(selected.labelEnabled);
    setResultAreaId(selected.resultAreaId ?? "");
    setDescription(selected.description);
    setDirty(false);
    setError(null);
  }, [selected]);

  function loadNew() {
    setSelectedId(null);
    setAreaName("");
    setDays([new Date().getDay()]);
    setStartTime("09:00");
    setDurationHours(1);
    setBackColor("#c8e0f0");
    setForeColor("#1b1d23");
    setLabelEnabled(true);
    setResultAreaId("");
    setDescription("");
    setDirty(true);
  }

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function toggleDay(d: number) {
    setDirty(true);
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  async function saveChartName() {
    const result = await renameTimeChartAction(chartId, name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function saveArea() {
    if (days.length === 0) {
      setError("Select at least one day.");
      return;
    }
    setSaving(true);
    setError(null);
    const input = {
      name: areaName || "Area",
      resultAreaId: resultAreaId || null,
      daysOfWeek: days,
      startMinute: timeInputToMinutes(startTime),
      durationMinutes: Math.max(15, Math.round(durationHours * 60)),
      labelEnabled,
      foreColor,
      backColor,
      description,
    };

    const result = selectedId
      ? await updateTimeChartAreaAction(selectedId, input)
      : await createTimeChartAreaAction(chartId, input);

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDirty(false);
    onChanged();
    if (!selectedId && result.id) setSelectedId(result.id);
  }

  async function removeArea() {
    if (!selectedId) return;
    if (!window.confirm("Delete this Time Chart area?")) return;
    const result = await deleteTimeChartAreaAction(selectedId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelectedId(null);
    setDirty(false);
    onChanged();
  }

  return (
    <>
      <Drawer open={open} onClose={requestClose} labelledBy="time-chart-title">
        {open && (
          <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-rule px-4 py-3">
              <h2 id="time-chart-title" className="text-[0.9375rem] font-semibold text-ink">
                Edit Time Chart
              </h2>
              <button
                type="button"
                className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised"
                onClick={requestClose}
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {error && (
                <p className="mb-3 rounded border border-priority-a/40 bg-priority-a/10 px-2 py-1.5 text-[0.8125rem] text-priority-a">
                  {error}
                </p>
              )}

              <div className="mb-4 flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  Chart name
                  <input
                    className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="rounded border border-rule px-2 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised"
                  onClick={saveChartName}
                >
                  Rename
                </button>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[0.8125rem] font-semibold text-ink">Areas</h3>
                <button
                  type="button"
                  className="rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised"
                  onClick={loadNew}
                >
                  + New area
                </button>
              </div>

              <ul className="mb-4 max-h-40 space-y-0.5 overflow-y-auto rounded border border-rule">
                {areas.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={[
                        "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[0.8125rem]",
                        selectedId === a.id
                          ? "bg-select text-ink"
                          : "hover:bg-surface-raised",
                      ].join(" ")}
                      onClick={() => setSelectedId(a.id)}
                    >
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-sm border border-rule"
                        style={{ background: a.backColor }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {a.name || "Untitled"}
                      </span>
                      <span className="text-[0.6875rem] text-ink-faint">
                        {a.daysOfWeek.map((d) => WEEKDAY_LABELS[d]?.[0]).join("")}
                      </span>
                    </button>
                  </li>
                ))}
                {areas.length === 0 && (
                  <li className="px-2 py-2 text-[0.8125rem] text-ink-faint">
                    No areas yet. Create one for Sleep, Work, etc.
                  </li>
                )}
              </ul>

              {(selectedId || dirty) && (
                <div className="space-y-3 rounded border border-rule p-3">
                  <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                    Name
                    <input
                      className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                      value={areaName}
                      onChange={(e) => {
                        setAreaName(e.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>

                  <div>
                    <div className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                      Days
                    </div>
                    <div className="mb-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-rule px-1.5 py-0.5 text-[0.75rem] text-ink hover:bg-surface-raised"
                        onClick={() => {
                          setDays([...WEEKDAYS]);
                          setDirty(true);
                        }}
                      >
                        Every day
                      </button>
                      <button
                        type="button"
                        className="rounded border border-rule px-1.5 py-0.5 text-[0.75rem] text-ink hover:bg-surface-raised"
                        onClick={() => {
                          setDays([...WEEKDAYS_ONLY]);
                          setDirty(true);
                        }}
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
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                      Start
                      <input
                        type="time"
                        className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          setDirty(true);
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                      Duration (hours)
                      <input
                        type="number"
                        min={0.25}
                        step={0.25}
                        className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                        value={durationHours}
                        onChange={(e) => {
                          setDurationHours(Number(e.target.value) || 0.25);
                          setDirty(true);
                        }}
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                    Result Area
                    <select
                      className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                      value={resultAreaId}
                      onChange={(e) => {
                        setResultAreaId(e.target.value);
                        setDirty(true);
                      }}
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
                      checked={labelEnabled}
                      onChange={(e) => {
                        setLabelEnabled(e.target.checked);
                        setDirty(true);
                      }}
                    />
                    Show label on chart
                  </label>

                  <div>
                    <div className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                      Background color
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={[
                            "h-6 w-6 rounded border",
                            backColor === c ? "border-select-edge ring-1 ring-select-edge" : "border-rule",
                          ].join(" ")}
                          style={{ background: c }}
                          onClick={() => {
                            setBackColor(c);
                            setDirty(true);
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        value={backColor}
                        className="h-6 w-8 cursor-pointer"
                        onChange={(e) => {
                          setBackColor(e.target.value);
                          setDirty(true);
                        }}
                      />
                    </div>
                  </div>

                  <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                    Description
                    <textarea
                      className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink"
                      rows={2}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={saving}
                      className="rounded bg-select-edge px-3 py-1.5 text-[0.8125rem] font-medium text-white disabled:opacity-50"
                      onClick={saveArea}
                    >
                      {saving ? "Saving…" : selectedId ? "Update area" : "Create area"}
                    </button>
                    {selectedId && (
                      <button
                        type="button"
                        className="rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-priority-a hover:bg-surface-raised"
                        onClick={removeArea}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmClose}
        title="Discard changes?"
        message="You have unsaved area edits. Close without saving?"
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setConfirmClose(false);
          setDirty(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}
