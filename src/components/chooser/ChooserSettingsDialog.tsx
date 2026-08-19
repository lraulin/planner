"use client";

import { useId } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { STATE_OPTIONS } from "@/lib/tree/hierarchy";
import type { ChooserWeights } from "@/lib/chooser/score";
import type { ChooserSettings } from "@/lib/chooser/types";
import type { ChooserView } from "@/lib/chooser/views";

/**
 * Achieve's Task Chooser Settings dialog (manual §8.2, §8.3): the scoring weights and the
 * next-action flags for the **current view only** — every view keeps its own, saved views
 * included, because a saved view's id keys its own `chooser:` scope.
 *
 * A modal because it is a short-lived configuration step, the one class `ux-principles`
 * allows, and built on `ModalShell` per `modal-pattern`. It holds no draft: each field
 * writes straight through, so there is nothing for closing to discard and no Cancel to
 * offer.
 */

type WeightField = { key: keyof ChooserWeights; label: string; hint?: string };

const WEIGHT_GROUPS: { title: string; fields: WeightField[] }[] = [
  {
    title: "Priority",
    fields: [
      {
        key: "priorityTop",
        label: "A priority",
        hint: "Points before rank is subtracted",
      },
      { key: "priorityLetterStep", label: "Per letter", hint: "Dropped from A→B→C→D" },
      { key: "priorityRankStep", label: "Per rank", hint: "Dropped from A1→A2→A3" },
    ],
  },
  {
    title: "Deadline",
    fields: [
      { key: "deadlineOverdue", label: "Overdue" },
      { key: "deadlineToday", label: "Due today" },
      { key: "deadlineTomorrow", label: "Due tomorrow" },
      { key: "deadlineSoon", label: "Due soon" },
      { key: "deadlineSoonDays", label: "“Soon” is", hint: "Days out" },
    ],
  },
  {
    title: "Target dates & bonuses",
    fields: [
      { key: "targetEndPast", label: "Target end passed" },
      { key: "targetStartReached", label: "Target start reached" },
      { key: "targetStartFuture", label: "Future target start (penalty)" },
      { key: "focusBonus", label: "Focus flag" },
      {
        key: "importanceWeight",
        label: "Area importance",
        hint: "Multiplied by the area’s 0–100 Importance",
      },
    ],
  },
];

export function ChooserSettingsDialog({
  open,
  view,
  viewName,
  settings,
  onChange,
  onReset,
  onClose,
}: {
  open: boolean;
  /** The **built-in** the selected view derives from: supplies the defaults and the blurb. */
  view: ChooserView;
  /**
   * The selected view's name, which is not `view.label` once a saved view is selected.
   *
   * The heading has to say the view whose settings these *are*. Titling it with the base
   * while the picker says "Deadline heavy" makes the line underneath — "these settings apply
   * to this view only" — point at the wrong view, which is worse than saying nothing.
   */
  viewName: string;
  settings: ChooserSettings;
  onChange: (
    patch: Partial<Omit<ChooserSettings, "weights">> & {
      weights?: Partial<ChooserWeights>;
    },
  ) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <ModalShell open={open} onClose={onClose} labelledBy={titleId} width="max-w-2xl">
      <div className="flex max-h-[80vh] flex-col">
        <div className="flex-none border-b border-rule p-5 pb-3">
          <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
            {viewName} Settings
          </h2>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">{view.description}</p>
          <p className="mt-1 text-[0.75rem] text-ink-faint">
            These settings apply to this view only. Every view keeps its own.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <fieldset className="mb-5">
            <legend className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              Next actions
            </legend>
            <div className="flex flex-col gap-2">
              <Toggle
                label="Only show next action(s) for project"
                checked={settings.onlyNextAction}
                onChange={(onlyNextAction) => onChange({ onlyNextAction })}
              />
              <Toggle
                label="Use task priority order for next project actions"
                hint={
                  settings.useTaskPriorityOrder
                    ? "Showing each project’s topmost task."
                    : "Showing each project’s highest-scoring task."
                }
                checked={settings.useTaskPriorityOrder}
                disabled={!settings.onlyNextAction}
                onChange={(useTaskPriorityOrder) => onChange({ useTaskPriorityOrder })}
              />
              <Toggle
                label="Rank by TC Priority"
                hint={
                  settings.rankByTcPriority
                    ? "Drag to rank; names take the TC Priority colour."
                    : "No ranking here; names take the outline priority colour."
                }
                checked={settings.rankByTcPriority}
                onChange={(rankByTcPriority) => onChange({ rankByTcPriority })}
              />
              <Toggle
                label="Hide tasks already planned for a day"
                hint="Once you decide when to do something, it leaves the master list."
                checked={settings.hidePlanned}
                onChange={(hidePlanned) => onChange({ hidePlanned })}
              />
            </div>
          </fieldset>

          <fieldset className="mb-5">
            <legend className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              Show these states
            </legend>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
              {STATE_OPTIONS.map((option) => (
                <Toggle
                  key={option.value}
                  label={option.label}
                  checked={settings.states.includes(option.value)}
                  onChange={(on) =>
                    onChange({
                      states: on
                        ? [...settings.states, option.value]
                        : settings.states.filter((state) => state !== option.value),
                    })
                  }
                />
              ))}
            </div>
            {settings.states.length === 0 && (
              <p className="mt-2 text-[0.75rem] text-priority-a">
                No states are ticked, so this view will always be empty.
              </p>
            )}
          </fieldset>

          {WEIGHT_GROUPS.map((group) => (
            <fieldset key={group.title} className="mb-5">
              <legend className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                {group.title}
              </legend>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {group.fields.map((field) => (
                  <WeightInput
                    key={field.key}
                    field={field}
                    value={settings.weights[field.key]}
                    onChange={(value) => onChange({ weights: { [field.key]: value } })}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-rule p-5 py-3">
          <button type="button" onClick={onReset} className={buttonClass}>
            Reset to defaults
          </button>
          <button type="button" onClick={onClose} className={`${buttonClass} ml-auto`}>
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

const buttonClass =
  "rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised";

function WeightInput({
  field,
  value,
  onChange,
}: {
  field: WeightField;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[0.8125rem] text-ink">
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{field.label}</span>
        {field.hint && (
          <span className="truncate text-[0.6875rem] text-ink-faint">{field.hint}</span>
        )}
      </span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          // Ignore a mid-edit empty box rather than writing NaN into the ordering.
          if (Number.isFinite(next)) onChange(next);
        }}
        className="tabular w-20 flex-none rounded border border-rule bg-surface px-2 py-1 text-right text-ink outline-none focus:border-select-edge"
      />
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer select-none items-start gap-2 text-[0.8125rem] ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 accent-[var(--select-edge)]"
      />
      <span className="flex flex-col">
        <span className="text-ink">{label}</span>
        {hint && <span className="text-[0.6875rem] text-ink-faint">{hint}</span>}
      </span>
    </label>
  );
}
