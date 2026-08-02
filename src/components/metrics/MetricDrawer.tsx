"use client";

import { useId, useState, useTransition } from "react";
import type { PriorityLetter } from "@/db/schema";
import {
  createMetricEntryAction,
  deleteMetricAction,
  deleteMetricEntryAction,
  getMetricDetailAction,
  updateMetricAction,
  updateMetricEntryAction,
} from "@/app/metrics/actions";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import { entriesToCsv } from "@/lib/metrics/csv";
import { shouldShowEntryTargetColumn } from "@/lib/metrics/derive";
import {
  formatMetricNumber,
  localDateKey,
  parseMetricInput,
} from "@/lib/metrics/parse";
import type { MetricDetail, MetricEntryView, MetricType } from "@/lib/metrics/types";
import { METRIC_TYPE_LABELS, METRIC_TYPES } from "@/lib/metrics/types";
import type { OutlineNode } from "@/lib/tree/types";

const inputClass =
  "w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none focus:border-select-edge";

const TYPE_HELP: Record<MetricType, string> = {
  instance: "Each entry is a separate reading (e.g. weight, score).",
  cumulative: "Entries add up as contributions (e.g. pages, dollars).",
  total: "Each entry is the current total or measurement.",
};

type Draft = {
  title: string;
  category: string;
  question: string;
  description: string;
  reason: string;
  units: string;
  active: boolean;
  priorityLetter: PriorityLetter | "";
  priorityRank: string;
  metricType: MetricType;
  objectiveTarget: string;
  ownerNodeId: string;
};

function toDraft(m: MetricDetail): Draft {
  return {
    title: m.title,
    category: m.category,
    question: m.question,
    description: m.description,
    reason: m.reason,
    units: m.units,
    active: m.active,
    priorityLetter: m.priorityLetter ?? "",
    priorityRank: m.priorityRank != null ? String(m.priorityRank) : "",
    metricType: m.metricType,
    objectiveTarget:
      m.objectiveTarget != null ? formatMetricNumber(m.objectiveTarget) : "",
    ownerNodeId: m.ownerNodeId ?? "",
  };
}

/**
 * Metric information drawer. Parent loads the detail and passes it in — no fetch-on-mount
 * effect (avoids set-state-in-effect lint and keeps the parent as the source of truth).
 */
export function MetricDrawer({
  detail,
  goals,
  onClose,
  onChanged,
}: {
  detail: MetricDetail | null;
  goals: OutlineNode[];
  onClose: () => void;
  /** Called after a successful mutation; parent should reload detail + lists. */
  onChanged: (metricId: string) => void;
}) {
  const titleId = useId();
  return (
    <Drawer open={detail !== null} onClose={onClose} labelledBy={titleId}>
      {detail && (
        <MetricForm
          key={detail.id}
          titleId={titleId}
          initial={detail}
          goals={goals}
          onClose={onClose}
          onChanged={onChanged}
        />
      )}
    </Drawer>
  );
}

function MetricForm({
  titleId,
  initial,
  goals,
  onClose,
  onChanged,
}: {
  titleId: string;
  initial: MetricDetail;
  goals: OutlineNode[];
  onClose: () => void;
  onChanged: (metricId: string) => void;
}) {
  const [detail, setDetail] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [tab, setTab] = useState<"general" | "tracking">("general");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [busy, startTransition] = useTransition();

  // No metric objective (and no imported per-entry targets) → hide Target column.
  // Objective alone is enough for the graph; per-row target is the exception.
  const showTargetColumn = shouldShowEntryTargetColumn(
    detail.objectiveTarget,
    detail.entries,
    draft.objectiveTarget,
  );
  const targetColSpan = showTargetColumn ? 5 : 4;
  const objectivePlaceholder =
    draft.objectiveTarget.trim() !== ""
      ? draft.objectiveTarget.trim()
      : detail.objectiveTarget != null
        ? formatMetricNumber(detail.objectiveTarget)
        : "—";

  const reloadDetail = () => {
    startTransition(async () => {
      const result = await getMetricDetailAction(detail.id);
      if (!result.ok || !result.data || Array.isArray(result.data)) {
        setError(result.ok ? "Metric not found." : result.error);
        return;
      }
      setDetail(result.data);
      if (!dirty) setDraft(toDraft(result.data));
      onChanged(detail.id);
    });
  };

  const patchDraft = (changes: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...changes }));
    setDirty(true);
    setJustSaved(false);
  };

  const save = async (andClose: boolean) => {
    setSaving(true);
    setError(null);
    const rank = draft.priorityRank.trim() === "" ? null : Number(draft.priorityRank);
    const targetParsed = parseMetricInput(draft.objectiveTarget);
    if (!targetParsed.ok) {
      setSaving(false);
      setError("Objective target must be a number or empty.");
      return false;
    }
    const result = await updateMetricAction(detail.id, {
      title: draft.title,
      category: draft.category,
      question: draft.question,
      description: draft.description,
      reason: draft.reason,
      units: draft.units,
      active: draft.active,
      priorityLetter: draft.priorityLetter === "" ? null : draft.priorityLetter,
      priorityRank:
        draft.priorityLetter === "" || rank === null || !Number.isFinite(rank)
          ? null
          : rank,
      metricType: draft.metricType,
      objectiveTarget: targetParsed.value,
      ownerNodeId: draft.ownerNodeId === "" ? null : draft.ownerNodeId,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setDirty(false);
    setJustSaved(true);
    const refreshed = await getMetricDetailAction(detail.id);
    if (refreshed.ok && refreshed.data && !Array.isArray(refreshed.data)) {
      setDetail(refreshed.data);
      setDraft(toDraft(refreshed.data));
    }
    onChanged(detail.id);
    if (andClose) onClose();
    return true;
  };

  const requestClose = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };

  const addEntry = () => {
    startTransition(async () => {
      const result = await createMetricEntryAction(detail.id, {
        entryDate: localDateKey(),
        value: 0,
        // Per-entry target is optional; objective target still drives the graph.
        target: null,
      });
      if (!result.ok) setError(result.error);
      else reloadDetail();
    });
  };

  const updateEntry = (entry: MetricEntryView, patch: Partial<MetricEntryView>) => {
    startTransition(async () => {
      const result = await updateMetricEntryAction(entry.id, {
        entryDate: patch.entryDate ?? entry.entryDate,
        entryType: patch.entryType ?? entry.entryType,
        target: patch.target !== undefined ? patch.target : entry.target,
        value: patch.value !== undefined ? patch.value : entry.value,
      });
      if (!result.ok) setError(result.error);
      else reloadDetail();
    });
  };

  const removeEntry = (entryId: string) => {
    if (!window.confirm("Delete this tracking entry?")) return;
    startTransition(async () => {
      const result = await deleteMetricEntryAction(entryId);
      if (!result.ok) setError(result.error);
      else reloadDetail();
    });
  };

  const exportCsv = () => {
    const csv = entriesToCsv(detail.entries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(detail.title || "metric").replace(/[^\w.-]+/g, "_")}-tracking.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeMetric = () => {
    if (!window.confirm("Delete this metric and all tracking values?")) return;
    startTransition(async () => {
      const result = await deleteMetricAction(detail.id);
      if (!result.ok) setError(result.error);
      else {
        onChanged(detail.id);
        onClose();
      }
    });
  };

  const goalOptions = goals.filter((g) => g.type === "goal");

  return (
    <>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Metric"
        title={draft.title || "Untitled"}
        onClose={requestClose}
        actions={
          <button
            type="button"
            onClick={removeMetric}
            disabled={busy}
            className="rounded px-2 py-1 text-[0.8125rem] text-danger hover:bg-surface-raised"
          >
            Delete
          </button>
        }
      />

      <div className="flex flex-none gap-1 border-b border-rule px-5 pt-2">
        {(
          [
            ["general", "General"],
            ["tracking", "Tracking"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border-b-2 px-3 py-1.5 text-[0.8125rem] ${
              tab === id
                ? "border-[var(--select-edge)] font-medium text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error && (
          <p className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-[0.8125rem] text-danger">
            {error}
          </p>
        )}

        {tab === "general" && (
          <div className="flex flex-col gap-3">
            <Field label="Title">
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => patchDraft({ title: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Owner">
              <select
                value={draft.ownerNodeId}
                onChange={(e) => patchDraft({ ownerNodeId: e.target.value })}
                className={inputClass}
              >
                <option value="">None (standalone)</option>
                {goalOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <input
                value={draft.category}
                onChange={(e) => patchDraft({ category: e.target.value })}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority">
                <select
                  value={draft.priorityLetter}
                  onChange={(e) =>
                    patchDraft({
                      priorityLetter: e.target.value as PriorityLetter | "",
                    })
                  }
                  className={inputClass}
                >
                  <option value="">—</option>
                  {(["A", "B", "C", "D"] as const).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rank">
                <input
                  value={draft.priorityRank}
                  onChange={(e) => patchDraft({ priorityRank: e.target.value })}
                  className={inputClass}
                  inputMode="numeric"
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                value={draft.description}
                onChange={(e) => patchDraft({ description: e.target.value })}
                rows={4}
                className={inputClass}
              />
            </Field>
            <Field label="Reason">
              <textarea
                value={draft.reason}
                onChange={(e) => patchDraft({ reason: e.target.value })}
                rows={3}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {tab === "tracking" && (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-[0.8125rem] text-ink">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => patchDraft({ active: e.target.checked })}
              />
              Active
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  value={draft.metricType}
                  onChange={(e) =>
                    patchDraft({ metricType: e.target.value as MetricType })
                  }
                  className={inputClass}
                >
                  {METRIC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {METRIC_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <span className="mt-0.5 text-[0.6875rem] leading-snug text-ink-faint">
                  {TYPE_HELP[draft.metricType]}
                </span>
              </Field>
              <Field label="Units">
                <input
                  value={draft.units}
                  onChange={(e) => patchDraft({ units: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Question">
              <input
                value={draft.question}
                onChange={(e) => patchDraft({ question: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Objective target (optional)">
              <input
                value={draft.objectiveTarget}
                onChange={(e) => patchDraft({ objectiveTarget: e.target.value })}
                className={inputClass}
                inputMode="decimal"
                placeholder="None"
              />
            </Field>

            <div className="mt-2 flex items-center justify-between">
              <h3 className="text-[0.8125rem] font-medium text-ink">Tracking values</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="rounded border border-rule px-2 py-1 text-[0.75rem] text-ink-muted hover:bg-surface-raised"
                >
                  CSV Export…
                </button>
                <button
                  type="button"
                  onClick={addEntry}
                  disabled={busy}
                  className="rounded border border-rule px-2 py-1 text-[0.75rem] text-ink hover:bg-surface-raised"
                >
                  + Entry
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-rule">
              <table className="w-full min-w-[20rem] text-left text-[0.8125rem]">
                <thead className="bg-surface-raised text-ink-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Type</th>
                    {showTargetColumn && (
                      <th className="px-2 py-1.5 font-medium">Target</th>
                    )}
                    <th className="px-2 py-1.5 font-medium">Value</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {detail.entries.length === 0 && (
                    <tr>
                      <td
                        colSpan={targetColSpan}
                        className="px-2 py-4 text-center text-ink-muted"
                      >
                        No entries yet.
                      </td>
                    </tr>
                  )}
                  {detail.entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-rule">
                      <td className="px-1 py-0.5">
                        <input
                          type="date"
                          value={entry.entryDate}
                          onChange={(e) =>
                            updateEntry(entry, { entryDate: e.target.value })
                          }
                          className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-rule focus:border-select-edge"
                        />
                      </td>
                      <td className="px-2 py-1 text-ink-muted">New Total</td>
                      {showTargetColumn && (
                        <td className="px-1 py-0.5">
                          <MetricDecimalCell
                            committed={entry.target}
                            allowEmpty
                            placeholder={objectivePlaceholder}
                            onCommit={(n) => {
                              if (n === entry.target) return;
                              if (n === null && entry.target === null) return;
                              updateEntry(entry, { target: n });
                            }}
                          />
                        </td>
                      )}
                      <td className="px-1 py-0.5">
                        <MetricDecimalCell
                          committed={entry.value}
                          allowEmpty={false}
                          onCommit={(n) => {
                            if (n === null || n === entry.value) return;
                            updateEntry(entry, { value: n });
                          }}
                        />
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.id)}
                          className="text-ink-faint hover:text-danger"
                          aria-label="Delete entry"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {showTargetColumn && (
              <p className="text-[0.6875rem] text-ink-faint">
                Leave Target blank to use the metric objective on the graph. Override a
                row only if that day’s target differed.
              </p>
            )}
            <p className="text-[0.75rem] text-ink-muted">
              Current / last value:{" "}
              <span className="font-medium text-ink">
                {detail.lastValue != null ? formatMetricNumber(detail.lastValue) : "—"}
              </span>
              {detail.lastDate ? ` (${detail.lastDate})` : ""}
            </p>
          </div>
        )}
      </div>

      <DrawerFooter
        onSave={() => void save(false)}
        onSaveAndClose={() => void save(true)}
        onClose={requestClose}
        saving={saving}
        dirty={dirty}
        justSaved={justSaved}
        error={error}
      />
    </>
  );
}

/**
 * Decimal cell that edits as free text and commits on blur/Enter.
 * Avoids controlled Number() on every keystroke, which strips trailing "." mid-type.
 */
function MetricDecimalCell({
  committed,
  onCommit,
  allowEmpty,
  placeholder,
}: {
  committed: number | null;
  onCommit: (n: number | null) => void;
  allowEmpty: boolean;
  placeholder?: string;
}) {
  const display = committed != null ? formatMetricNumber(committed) : "";
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? display;

  const finish = () => {
    const parsed = parseMetricInput(text);
    if (!parsed.ok || (parsed.value === null && !allowEmpty)) {
      setDraft(null);
      return;
    }
    onCommit(parsed.value);
    setDraft(null);
  };

  return (
    <input
      value={text}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className="w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-rule focus:border-select-edge"
      inputMode="decimal"
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[0.75rem] text-ink-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}
