"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent as ReactChangeEvent,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PriorityLetter } from "@/db/schema";
import {
  createMetricEntryAction,
  deleteMetricAction,
  deleteMetricEntryAction,
  getMetricDetailAction,
  importMetricEntriesAction,
  updateMetricAction,
  updateMetricEntryAction,
} from "@/app/metrics/actions";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import { ShowFieldsDialog } from "@/components/grid/ShowFieldsDialog";
import { useGridState } from "@/components/grid/useGridState";
import {
  displayEntryType,
  entriesToClipboardTsv,
  entriesToCsv,
  parseEntriesCsv,
  pickEntriesInOrder,
} from "@/lib/metrics/csv";
import {
  applyFrozenEntryOrder,
  sortEntriesByDate,
  type EntryDateSort,
} from "@/lib/metrics/derive";
import { applySelect, selectOnly } from "@/lib/grid/selection";
import { isTypingTarget } from "@/lib/keyboard";
import {
  formatMetricNumber,
  isDateKey,
  localDateKey,
  parseMetricInput,
} from "@/lib/metrics/parse";
import {
  TRACKING_COLUMNS,
  TRACKING_DEFAULT_ORDER,
  TRACKING_GRID_TAB_ID,
} from "@/lib/metrics/trackingColumns";
import type { MetricDetail, MetricEntryView, MetricType } from "@/lib/metrics/types";
import { METRIC_TYPE_LABELS, METRIC_TYPES } from "@/lib/metrics/types";
import { writeClipboardText } from "@/lib/tree/copyAsText";
import type { OutlineNode } from "@/lib/tree/types";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { formatFullDateKey } from "@/lib/dateFormat";

const inputClass =
  "min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none focus:border-select-edge md:min-h-0";

/**
 * The Tracking tab's secondary actions. Tap-sized below `md` (`responsive.md` — 44px, from
 * `--tap-target`), back to the drawer's own 12px chrome above it.
 */
const trackingActionClass =
  "min-h-tap flex-none rounded border border-rule px-3 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-raised md:min-h-0 md:px-2 md:text-[0.75rem]";

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
 *
 * The Tracking tab's list of readings is a plain `<table>`, **not** `DataGrid`, even though
 * the Metrics tab behind it is a grid. It is a form sub-list, closer to the detail drawer's
 * `ItemList` than to a module list: every cell is an inline editor writing one entry, and the
 * order is deliberately frozen while focus is inside it (`ux-principles.md` — no re-sort while
 * editing), which is the opposite of what a grid's sort is for. It does reuse the grid's column
 * machinery where that fits — `useGridState` and `ShowFieldsDialog` drive which columns show,
 * on the same persistence rail as everywhere else. The rule being diverged from is
 * `components/data-grid.md`.
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
  const formatDate = useDateFormatter();
  const [detail, setDetail] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [tab, setTab] = useState<"general" | "tracking">("general");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [busy, startTransition] = useTransition();
  /** Newest first by default (matches Achieve and the list Last Value feel). */
  const [dateSort, setDateSort] = useState<EntryDateSort>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [showFields, setShowFields] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);
  /**
   * While focus is inside the tracking table, keep this id order so a date/value
   * commit cannot re-sort the row out from under the user (ux-principles).
   */
  const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);

  // Shared across every metric (not per-metric) — same rail as other grids.
  const trackingFields = useGridState(TRACKING_GRID_TAB_ID, TRACKING_COLUMNS, {
    order: TRACKING_DEFAULT_ORDER,
  });
  const fieldIds = trackingFields.order;
  const showTypeColumn = fieldIds.includes("type");
  const showTargetColumn = fieldIds.includes("target");
  // +1 for the delete control column
  const tableColSpan = fieldIds.length + 1;

  const objectivePlaceholder =
    draft.objectiveTarget.trim() !== ""
      ? draft.objectiveTarget.trim()
      : detail.objectiveTarget != null
        ? formatMetricNumber(detail.objectiveTarget)
        : "—";

  const sortedEntries = useMemo(
    () => sortEntriesByDate(detail.entries, dateSort),
    [detail.entries, dateSort],
  );

  const displayEntries = useMemo(
    () => applyFrozenEntryOrder(sortedEntries, frozenOrder),
    [sortedEntries, frozenOrder],
  );

  const toggleDateSort = () => {
    setFrozenOrder(null);
    setDateSort((d) => (d === "desc" ? "asc" : "desc"));
  };

  const freezeDisplayOrder = useCallback(() => {
    setFrozenOrder((prev) => {
      if (prev) return prev;
      return sortEntriesByDate(detail.entries, dateSort).map((e) => e.id);
    });
  }, [detail.entries, dateSort]);

  const onTrackingTableFocusOut = (event: ReactFocusEvent<HTMLTableElement>) => {
    // Defer: native date pickers can briefly clear focus while navigating months.
    const table = event.currentTarget;
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof Node && table.contains(active)) return;
      setFrozenOrder(null);
    }, 0);
  };

  const orderedEntryIds = useMemo(
    () => displayEntries.map((e) => e.id),
    [displayEntries],
  );

  /**
   * The selection as it applies to what is on screen.
   *
   * Deleting an entry leaves its id in `selectedIds` — nothing removes it — which used to
   * make "Copy (N)" count rows that were gone. Derived rather than synced: the grid's
   * `pruneSelection` would do this, but it also selects the first row whenever the set
   * comes back empty, which here would light up a row every time an entry was deleted.
   * A stale anchor is dropped for the same reason: `applySelect` keeps an anchor it cannot
   * find, so Shift-click would stay stuck on the missing row instead of re-anchoring.
   */
  const liveSelectedIds = useMemo(() => {
    const visible = new Set(orderedEntryIds);
    return new Set([...selectedIds].filter((id) => visible.has(id)));
  }, [selectedIds, orderedEntryIds]);

  const liveAnchor =
    selectionAnchor && orderedEntryIds.includes(selectionAnchor)
      ? selectionAnchor
      : null;

  const selectEntryRow = useCallback(
    (entryId: string, event: ReactMouseEvent) => {
      const toggle = event.metaKey || event.ctrlKey;
      // The one place this table parts company with the grid: ⌘-clicking the only selected
      // row clears the selection. `applySelect` refuses to go empty because a grid always
      // needs a focus row for its keyboard commands; here selection is incidental — it
      // exists to enable Copy — and starts empty, so being able to put it back is right.
      if (toggle && liveSelectedIds.size === 1 && liveSelectedIds.has(entryId)) {
        setSelectedIds(new Set());
        setSelectionAnchor(null);
        return;
      }
      const result = applySelect(
        liveSelectedIds,
        liveAnchor,
        // The grid's focus row: this table has none, so the anchor stands in for it.
        liveAnchor,
        entryId,
        orderedEntryIds,
        { extend: event.shiftKey, toggle },
      );
      setSelectedIds(result.selectedIds);
      setSelectionAnchor(result.anchorId);
    },
    [liveSelectedIds, liveAnchor, orderedEntryIds],
  );

  const copySelectedEntries = useCallback(async () => {
    const rows = pickEntriesInOrder(displayEntries, liveSelectedIds);
    if (rows.length === 0) return;
    const text = entriesToClipboardTsv(rows, { includeTarget: showTargetColumn });
    await writeClipboardText(text);
  }, [displayEntries, liveSelectedIds, showTargetColumn]);

  useEffect(() => {
    if (tab !== "tracking") return;
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        if (liveSelectedIds.size === 0) return;
        event.preventDefault();
        void copySelectedEntries();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [tab, liveSelectedIds, copySelectedEntries]);

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

  const importCsv = (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file later.
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = parseEntriesCsv(text);
      if (parsed.entries.length === 0) {
        const first = parsed.errors[0];
        setStatus(null);
        setError(
          first?.message ??
            "No tracking rows found. Expected columns Date and Value (YYYY-MM-DD).",
        );
        return;
      }

      startTransition(async () => {
        const result = await importMetricEntriesAction(detail.id, parsed.entries);
        if (!result.ok) {
          setStatus(null);
          setError(result.error);
          return;
        }
        const created = result.data.created;
        const skipped = result.data.skipped;
        const parts = [`Imported ${created}`];
        if (skipped > 0) parts.push(`skipped ${skipped} duplicate`);
        if (parsed.errors.length > 0) {
          parts.push(`${parsed.errors.length} invalid row(s) ignored`);
        }
        setError(null);
        setStatus(parts.join("; ") + ".");
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 2000);
        reloadDetail();
        onChanged(detail.id);
      });
    };
    reader.onerror = () => {
      setStatus(null);
      setError("Could not read the CSV file.");
    };
    reader.readAsText(file);
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
            className="min-h-tap flex-none rounded px-2 py-1 text-[0.8125rem] text-priority-a hover:bg-surface-raised md:min-h-0"
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
            className={`min-h-tap border-b-2 px-3 py-1.5 text-[0.8125rem] md:min-h-0 ${
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
          <p className="mb-3 rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a">
            {error}
          </p>
        )}
        {status && !error && (
          <p className="mb-3 rounded border border-rule bg-surface-raised px-3 py-2 text-[0.8125rem] text-ink-muted">
            {status}
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
            <label className="flex min-h-tap items-center gap-2 text-[0.8125rem] text-ink md:min-h-0">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => patchDraft({ active: e.target.checked })}
                className="h-5 w-5 accent-[var(--select-edge)] md:h-3.5 md:w-3.5"
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

            {/*
              Logging a reading is what this tab is *for* on a phone, and it was previously the
              last of five same-sized buttons in a wrapping row. Below `md` it leads the row at
              full width; the file and column commands wrap underneath, tap-sized.
            */}
            <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h3 className="text-[0.8125rem] font-medium text-ink">Tracking values</h3>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <button
                  type="button"
                  onClick={addEntry}
                  disabled={busy}
                  className="min-h-tap w-full flex-none rounded border border-rule bg-surface-raised px-3 py-1 text-[0.8125rem] font-medium text-ink hover:border-rule-strong disabled:opacity-50 md:order-last md:min-h-0 md:w-auto md:bg-transparent md:px-2 md:text-[0.75rem] md:font-normal"
                >
                  + Entry
                </button>
                {liveSelectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => void copySelectedEntries()}
                    className={trackingActionClass}
                  >
                    Copy
                    {liveSelectedIds.size > 1 ? ` (${liveSelectedIds.size})` : ""}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFields(true)}
                  className={trackingActionClass}
                >
                  Show Fields…
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  className={trackingActionClass}
                >
                  CSV Export…
                </button>
                <button
                  type="button"
                  onClick={() => csvImportRef.current?.click()}
                  disabled={busy}
                  className={trackingActionClass}
                >
                  CSV Import…
                </button>
                <input
                  ref={csvImportRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={importCsv}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-rule">
              <table
                className="w-full min-w-[16rem] text-left text-[0.8125rem]"
                onFocusCapture={freezeDisplayOrder}
                onBlurCapture={onTrackingTableFocusOut}
              >
                <thead className="bg-surface-raised text-ink-muted">
                  <tr>
                    {fieldIds.map((fieldId) => {
                      if (fieldId === "date") {
                        return (
                          <th key={fieldId} className="px-2 py-1.5 font-medium">
                            <button
                              type="button"
                              onClick={toggleDateSort}
                              className="inline-flex items-center gap-0.5 uppercase tracking-wider hover:text-ink"
                              title={
                                dateSort === "desc"
                                  ? "Newest first — click for oldest first"
                                  : "Oldest first — click for newest first"
                              }
                            >
                              Date
                              <span aria-hidden className="font-normal">
                                {dateSort === "desc" ? " ↓" : " ↑"}
                              </span>
                            </button>
                          </th>
                        );
                      }
                      const meta = TRACKING_COLUMNS.find((c) => c.id === fieldId);
                      return (
                        <th key={fieldId} className="px-2 py-1.5 font-medium">
                          {meta?.label ?? fieldId}
                        </th>
                      );
                    })}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {displayEntries.length === 0 && (
                    <tr>
                      <td
                        colSpan={tableColSpan}
                        className="px-2 py-4 text-center text-ink-muted"
                      >
                        No entries yet.
                      </td>
                    </tr>
                  )}
                  {displayEntries.map((entry) => {
                    const selected = liveSelectedIds.has(entry.id);
                    const focusRow = () => {
                      freezeDisplayOrder();
                      const result = selectOnly(entry.id);
                      setSelectedIds(result.selectedIds);
                      setSelectionAnchor(result.anchorId);
                    };
                    return (
                      <tr
                        key={entry.id}
                        className={[
                          "border-t border-rule",
                          selected ? "bg-select" : "hover:bg-surface-raised/60",
                        ].join(" ")}
                        onClick={(e) => {
                          // Inputs/buttons handle their own interaction; row click selects.
                          if ((e.target as HTMLElement).closest("input, button")) {
                            return;
                          }
                          selectEntryRow(entry.id, e);
                        }}
                      >
                        {fieldIds.map((fieldId) => {
                          if (fieldId === "date") {
                            return (
                              <td key={fieldId} className="px-1 py-0.5">
                                <MetricDateCell
                                  committed={entry.entryDate}
                                  onCommit={(entryDate) => {
                                    if (entryDate === entry.entryDate) return;
                                    updateEntry(entry, { entryDate });
                                  }}
                                  onFocus={focusRow}
                                />
                              </td>
                            );
                          }
                          if (fieldId === "type") {
                            return (
                              <td
                                key={fieldId}
                                className="px-2 py-1 text-ink-muted"
                                title="Per-entry type override (read-only for now)"
                              >
                                {displayEntryType(entry.entryType)}
                              </td>
                            );
                          }
                          if (fieldId === "target") {
                            return (
                              <td key={fieldId} className="px-1 py-0.5">
                                <MetricDecimalCell
                                  committed={entry.target}
                                  allowEmpty
                                  placeholder={objectivePlaceholder}
                                  onCommit={(n) => {
                                    if (n === entry.target) return;
                                    if (n === null && entry.target === null) return;
                                    updateEntry(entry, { target: n });
                                  }}
                                  onFocus={focusRow}
                                />
                              </td>
                            );
                          }
                          if (fieldId === "value") {
                            return (
                              <td key={fieldId} className="px-1 py-0.5">
                                <MetricDecimalCell
                                  committed={entry.value}
                                  allowEmpty={false}
                                  onCommit={(n) => {
                                    if (n === null || n === entry.value) return;
                                    updateEntry(entry, { value: n });
                                  }}
                                  onFocus={focusRow}
                                />
                              </td>
                            );
                          }
                          return null;
                        })}
                        <td className="px-1">
                          {/*
                            A bare `×` glyph is a ~10px target. Below `md` it gets a real one
                            (`responsive.md`) — it sits beside a date field, and a mis-tap here
                            deletes a reading.
                          */}
                          <button
                            type="button"
                            onClick={() => removeEntry(entry.id)}
                            className="flex h-tap w-tap items-center justify-center rounded text-[1.125rem] leading-none text-ink-faint hover:text-priority-a md:h-6 md:w-6 md:text-[0.875rem]"
                            aria-label="Delete entry"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[0.6875rem] text-ink-faint">
              {/* Shift-click, ⌘-click and ⌘C do not exist on a phone; the sentence about them
                  is noise there, and the rest of the paragraph still applies. */}
              Tap Date to sort.{" "}
              <span className="hidden md:inline">
                Click a row to select; Shift-click for a range, ⌘-click to multi-select;
                ⌘C copies.{" "}
              </span>
              Show Fields chooses columns for every metric.
              {showTargetColumn
                ? " Leave Target blank to use the metric objective on the graph."
                : ""}
              {showTypeColumn
                ? " Type is the per-entry override (rarely needed; metric Type covers most cases)."
                : ""}
            </p>
            <p className="text-[0.75rem] text-ink-muted">
              Current / last value:{" "}
              <span className="font-medium text-ink">
                {detail.lastValue != null ? formatMetricNumber(detail.lastValue) : "—"}
              </span>
              {detail.lastDate ? (
                <span title={formatFullDateKey(detail.lastDate)}>
                  {` (${formatDate(detail.lastDate)})`}
                </span>
              ) : null}
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

      <ShowFieldsDialog
        open={showFields}
        allColumns={TRACKING_COLUMNS}
        shownIds={trackingFields.order}
        onShow={trackingFields.show}
        onHide={trackingFields.hide}
        onMove={trackingFields.move}
        onPlace={trackingFields.place}
        onReset={trackingFields.resetColumns}
        onResetGrid={trackingFields.reset}
        onClose={() => setShowFields(false)}
      />
    </>
  );
}

/**
 * Date cell: local draft while the native picker is open; commit on blur/Enter.
 * Month/year navigation must not write the server or re-sort the grid.
 */
function MetricDateCell({
  committed,
  onCommit,
  onFocus,
}: {
  committed: string;
  onCommit: (dateKey: string) => void;
  onFocus?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? committed;

  const finish = () => {
    const next = (draft ?? committed).trim();
    setDraft(null);
    if (!isDateKey(next)) return;
    if (next !== committed) onCommit(next);
  };

  return (
    <input
      type="date"
      value={value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onFocus={onFocus}
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
      className="min-h-tap w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-rule focus:border-select-edge md:min-h-0"
    />
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
  onFocus,
}: {
  committed: number | null;
  onCommit: (n: number | null) => void;
  allowEmpty: boolean;
  placeholder?: string;
  onFocus?: () => void;
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
      onFocus={onFocus}
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
      className="min-h-tap w-full rounded border border-transparent bg-transparent px-1 py-1 hover:border-rule focus:border-select-edge md:min-h-0"
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
