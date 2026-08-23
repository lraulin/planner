"use client";

import { useId, useMemo, useState, useTransition } from "react";

import { saveEnvelopeTemplatesAction } from "@/app/finances/actions";
import { Drawer, DrawerFooter, DrawerHeader } from "@/components/detail/Drawer";
import {
  draftsFromTemplates,
  draftsToTemplates,
  newDraft,
  type ByDraft,
  type Draft,
  type RemainderDraft,
  type ScheduleDraft,
  type SimpleDraft,
} from "@/lib/finances/budget/templates/draft";
import {
  applyTemplates,
  type EnvelopeApplyInput,
} from "@/lib/finances/budget/templates/apply";
import { scheduleSnapshotMap } from "@/lib/finances/budget/templates/snapshot";
import type { ScheduleSnapshot } from "@/lib/finances/budget/templates/schedule";
import {
  summarize,
  TEMPLATE_TYPES,
  type TemplateType,
} from "@/lib/finances/budget/templates/types";
import { monthLabel, type MonthKey } from "@/lib/finances/budget/envelope";
import { formatUsd } from "@/lib/finances/money";

const inputClass =
  "min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:py-1 md:text-[0.8125rem]";

const labelClass = "flex flex-col gap-1 text-[0.75rem] text-ink-muted";

const TYPE_LABELS: Record<TemplateType, string> = {
  simple: "Monthly amount",
  schedule: "Schedule",
  by: "Save up by",
  remainder: "Remainder",
};

const TYPE_HELP: Record<TemplateType, string> = {
  simple: "A fixed amount each month, a ceiling to refill to, or both.",
  schedule:
    "Fund one of your schedules — in full when it is due, sinking when it is not.",
  by: "Reach an amount by a month, spreading the rest over the months left.",
  remainder:
    "Take a share of whatever Ready to Assign is left after every other envelope.",
};

/**
 * The envelope's goal templates, edited as a list of lines.
 *
 * The preview under the list is not an estimate — it is `applyTemplates` run over this one
 * envelope with `force`, which is exactly what **Overwrite this envelope** does. Anything that
 * approximated it here would eventually disagree with the button next to it, and the disagreement
 * would be invisible until money moved.
 *
 * Explicit Save that stays open (`drawer-pattern.md`): templates are a structured record people
 * build up a line at a time, not a one-shot dialog.
 */
export function TemplateDrawer({
  envelope,
  month,
  todayKey,
  readyToAssignCents,
  schedules,
  onClose,
  onSaved,
}: {
  envelope: EnvelopeApplyInput;
  month: MonthKey;
  todayKey: string;
  readyToAssignCents: number;
  schedules: readonly ScheduleSnapshot[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    draftsFromTemplates(envelope.templates),
  );
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const snapshots = useMemo(() => scheduleSnapshotMap(schedules), [schedules]);
  const open = useMemo(
    () => schedules.filter((schedule) => !schedule.completed),
    [schedules],
  );

  const parsed = useMemo(() => draftsToTemplates(drafts), [drafts]);

  /**
   * What Overwrite would assign right now. Errors are surfaced beside the total rather than
   * swallowed: a schedule line naming a completed or deleted schedule contributes nothing, and
   * a silent zero is indistinguishable from a template that is simply not due.
   */
  const preview = useMemo(() => {
    if (!parsed.ok) return null;
    return applyTemplates({
      month,
      envelopes: [{ ...envelope, templates: parsed.templates }],
      schedules: snapshots,
      readyToAssignCents,
      force: true,
      todayKey,
    });
  }, [parsed, envelope, month, snapshots, readyToAssignCents, todayKey]);

  function edit(next: Draft[]) {
    setDrafts(next);
    setDirty(true);
    setJustSaved(false);
    setError(null);
  }

  function update(id: string, patch: Partial<Draft>) {
    edit(
      drafts.map((draft) =>
        draft.id === id ? ({ ...draft, ...patch } as Draft) : draft,
      ),
    );
  }

  function add(type: TemplateType) {
    edit([...drafts, newDraft(type, month)]);
  }

  function save(andClose: boolean) {
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    const templates = parsed.templates;
    startSaving(async () => {
      const result = await saveEnvelopeTemplatesAction(envelope.id, templates);
      if (!result.ok) {
        setError(result.error ?? "Could not save the templates.");
        return;
      }
      setDirty(false);
      setJustSaved(true);
      onSaved();
      if (andClose) onClose();
    });
  }

  function requestClose() {
    if (dirty && !window.confirm("Discard the changes to these templates?")) return;
    onClose();
  }

  return (
    <Drawer open onClose={requestClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow="Envelope templates"
        title={envelope.name}
        onClose={requestClose}
      />

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <p className="text-[0.8125rem] text-ink-muted">
          Templates decide what {envelope.name} asks for. Nothing is assigned until you
          run <strong className="font-medium text-ink">Apply templates</strong> — this
          list only says what Apply should do.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="rounded border border-rule bg-surface-raised px-3 py-2"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  {TYPE_LABELS[draft.type]}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                  {lineSummary(draft, snapshots)}
                </span>
                <button
                  type="button"
                  onClick={() => edit(drafts.filter((row) => row.id !== draft.id))}
                  title={`Remove this ${TYPE_LABELS[draft.type].toLowerCase()} line`}
                  className="min-h-tap flex-none rounded px-2 text-[0.75rem] text-ink-muted hover:bg-surface hover:text-ink md:min-h-0"
                >
                  Remove
                </button>
              </div>

              <DraftFields
                draft={draft}
                schedules={open}
                onChange={(patch) => update(draft.id, patch)}
              />
            </li>
          ))}
        </ul>

        {drafts.length === 0 ? (
          <p className="mt-4 rounded border border-dashed border-rule px-3 py-4 text-center text-[0.8125rem] text-ink-muted">
            No templates yet. Add a line below.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {TEMPLATE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => add(type)}
              title={TYPE_HELP[type]}
              className="min-h-tap rounded border border-rule px-3 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
            >
              Add {TYPE_LABELS[type].toLowerCase()}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded border border-rule px-3 py-2 text-[0.8125rem]">
          <p className="text-ink-muted">
            {monthLabel(month)} — what Overwrite would assign
          </p>
          {!parsed.ok ? (
            <p className="mt-1 text-[var(--goal-unmet)]">{parsed.error}</p>
          ) : (
            <>
              <p className="tabular mt-1 text-[1.0625rem] text-ink">
                {formatUsd(preview?.allocations[0]?.amountCents ?? 0)}
              </p>
              <p className="text-[0.75rem] text-ink-muted">
                {envelope.carryInCents === 0
                  ? "Nothing carried in from last month."
                  : `${formatUsd(envelope.carryInCents)} carried in from last month is already counted.`}
              </p>
              {preview?.errors.map((problem) => (
                <p key={problem.message} className="mt-1 text-[var(--goal-unmet)]">
                  {problem.message}
                </p>
              ))}
            </>
          )}
        </div>
      </div>

      <DrawerFooter
        onSave={() => save(false)}
        onSaveAndClose={() => save(true)}
        onClose={requestClose}
        saving={saving}
        dirty={dirty}
        justSaved={justSaved}
        error={error}
      />
    </Drawer>
  );
}

function lineSummary(
  draft: Draft,
  snapshots: ReadonlyMap<string, ScheduleSnapshot>,
): string {
  const single = draftsToTemplates([draft]);
  if (!single.ok) return "Incomplete";
  const template = single.templates[0];
  const name =
    template.type === "schedule" ? snapshots.get(template.scheduleId)?.name : undefined;
  return summarize(template, name);
}

function DraftFields({
  draft,
  schedules,
  onChange,
}: {
  draft: Draft;
  schedules: readonly ScheduleSnapshot[];
  onChange: (patch: Partial<Draft>) => void;
}) {
  switch (draft.type) {
    case "simple":
      return <SimpleFields draft={draft} onChange={onChange} />;
    case "schedule":
      return <ScheduleFields draft={draft} schedules={schedules} onChange={onChange} />;
    case "by":
      return <ByFields draft={draft} onChange={onChange} />;
    case "remainder":
      return <RemainderFields draft={draft} onChange={onChange} />;
  }
}

function SimpleFields({
  draft,
  onChange,
}: {
  draft: SimpleDraft;
  onChange: (patch: Partial<SimpleDraft>) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <label className={labelClass}>
        Each month
        <input
          type="text"
          inputMode="decimal"
          value={draft.monthly}
          placeholder="—"
          onChange={(event) => onChange({ monthly: event.target.value })}
          className={`tabular w-28 text-right ${inputClass}`}
        />
      </label>
      <label className={labelClass}>
        Up to
        <input
          type="text"
          inputMode="decimal"
          value={draft.limit}
          placeholder="—"
          onChange={(event) => onChange({ limit: event.target.value })}
          className={`tabular w-28 text-right ${inputClass}`}
        />
      </label>
      <label className="flex min-h-tap items-center gap-2 text-[0.8125rem] text-ink-muted md:min-h-0">
        <input
          type="checkbox"
          checked={draft.hold}
          disabled={draft.limit.trim() === ""}
          onChange={(event) => onChange({ hold: event.target.checked })}
        />
        <span
          title={
            draft.limit.trim() === ""
              ? "Set a limit first — hold only means anything with one"
              : "Keep money already over the limit instead of assigning it away"
          }
        >
          Hold what is over
        </span>
      </label>
      <p className="w-full text-[0.75rem] text-ink-faint">
        Leave <em>each month</em> blank to refill to the limit instead of adding a fixed
        amount.
      </p>
    </div>
  );
}

function ScheduleFields({
  draft,
  schedules,
  onChange,
}: {
  draft: ScheduleDraft;
  schedules: readonly ScheduleSnapshot[];
  onChange: (patch: Partial<ScheduleDraft>) => void;
}) {
  // A schedule that has been completed or deleted since this line was written is still named
  // here, so the select never silently re-points the line at a different schedule.
  const missing =
    draft.scheduleId !== "" &&
    !schedules.some((schedule) => schedule.id === draft.scheduleId);

  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <label className={labelClass}>
        Schedule
        <select
          value={draft.scheduleId}
          onChange={(event) => onChange({ scheduleId: event.target.value })}
          className={inputClass}
        >
          <option value="">Pick a schedule…</option>
          {missing ? (
            <option value={draft.scheduleId}>(no longer available)</option>
          ) : null}
          {schedules.map((schedule) => (
            <option key={schedule.id} value={schedule.id}>
              {schedule.name} ({formatUsd(Math.abs(schedule.amountCents))})
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-tap items-center gap-2 text-[0.8125rem] text-ink-muted md:min-h-0">
        <input
          type="checkbox"
          checked={draft.full}
          onChange={(event) => onChange({ full: event.target.checked })}
        />
        <span title="Assign the whole amount in the month it is due instead of saving towards it">
          Fund it all in the due month
        </span>
      </label>
    </div>
  );
}

function ByFields({
  draft,
  onChange,
}: {
  draft: ByDraft;
  onChange: (patch: Partial<ByDraft>) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <label className={labelClass}>
        Amount
        <input
          type="text"
          inputMode="decimal"
          value={draft.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          className={`tabular w-32 text-right ${inputClass}`}
        />
      </label>
      <label className={labelClass}>
        By
        <input
          type="month"
          value={draft.month}
          onChange={(event) => onChange({ month: event.target.value })}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Repeat every
        <input
          type="text"
          inputMode="numeric"
          value={draft.repeat}
          placeholder="once"
          onChange={(event) => onChange({ repeat: event.target.value })}
          className={`tabular w-20 text-right ${inputClass}`}
        />
      </label>
      <label className="flex min-h-tap items-center gap-2 text-[0.8125rem] text-ink-muted md:min-h-0">
        <input
          type="checkbox"
          checked={draft.annual}
          disabled={draft.repeat.trim() === ""}
          onChange={(event) => onChange({ annual: event.target.checked })}
        />
        <span
          title={
            draft.repeat.trim() === ""
              ? "Set a repeat first — the unit only means something with one"
              : "Count the repeat in years rather than months"
          }
        >
          Years, not months
        </span>
      </label>
    </div>
  );
}

function RemainderFields({
  draft,
  onChange,
}: {
  draft: RemainderDraft;
  onChange: (patch: Partial<RemainderDraft>) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <label className={labelClass}>
        Weight
        <input
          type="text"
          inputMode="numeric"
          value={draft.weight}
          onChange={(event) => onChange({ weight: event.target.value })}
          className={`tabular w-20 text-right ${inputClass}`}
        />
      </label>
      <p className="text-[0.75rem] text-ink-faint">
        Shares of the leftover, split against every other remainder envelope. Never
        takes Ready to Assign below zero.
      </p>
    </div>
  );
}
