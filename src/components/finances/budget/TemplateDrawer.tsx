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
  type SimpleDraft,
  type WeeklyDraft,
} from "@/lib/finances/budget/templates/draft";
import {
  applyTemplates,
  type EnvelopeApplyInput,
} from "@/lib/finances/budget/templates/apply";
import {
  summarize,
  TEMPLATE_TYPES,
  type TemplateType,
} from "@/lib/finances/budget/templates/types";
import { monthKeyOf, monthLabel, type MonthKey } from "@/lib/finances/budget/envelope";
import type { AssignHistoryMonth } from "@/lib/finances/budget/assign/types";
import { suggestWeeklyAmountCents } from "@/lib/finances/budget/templates/suggest";
import { countWeekdayInMonth } from "@/lib/finances/budget/templates/weekly";
import { weekdayLongLabel } from "@/lib/dateFormat";
import { formatUsd } from "@/lib/finances/money";

const inputClass =
  "min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:py-1 md:text-[0.8125rem]";

const labelClass = "flex flex-col gap-1 text-[0.75rem] text-ink-muted";

/**
 * Two different jobs, named rather than described (spec D6).
 *
 * A **contribution** says what this month costs; its leftovers stay put until you move them.
 * A **balance** says how much should be sitting there; what is already there counts toward it,
 * so the ask shrinks. The words "refill" and "set aside" are deliberately absent — they were
 * adjectives on two behaviours, which is what made the balance job look like the obvious
 * choice for groceries.
 */
const TYPE_LABELS: Record<TemplateType, string> = {
  simple: "Add every month",
  weekly: "Amount each weekday",
  by: "Save up by",
  remainder: "Remainder",
};

/** The add buttons read as verbs; the labels above read as nouns and do not fit after "Add". */
const ADD_LABELS: Record<TemplateType, string> = {
  simple: "Add a monthly amount",
  weekly: "Add an amount each weekday",
  by: "Add a save-up target",
  remainder: "Add a remainder share",
};

const TYPE_HELP: Record<TemplateType, string> = {
  simple:
    "This month costs a fixed amount. Leftovers stay put until you move them. Can also keep a balance available instead.",
  weekly:
    "An amount for each Friday (or any weekday) in the month — five-Friday months ask for five.",
  by: "Reach an amount by a month, spreading the rest over the months left.",
  remainder:
    "Take a share of whatever Ready to Assign is left after every other envelope.",
};

/**
 * The envelope's goal templates, edited as a list of lines.
 *
 * The preview under the list is not an estimate — it is `applyTemplates` run over this one
 * envelope with `force`, which is the unclamped ask Underfunded will try to fund. Anything that
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
  history,
  onClose,
  onSaved,
}: {
  envelope: EnvelopeApplyInput;
  month: MonthKey;
  todayKey: string;
  readyToAssignCents: number;
  history: readonly AssignHistoryMonth[];
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

  const parsed = useMemo(() => draftsToTemplates(drafts), [drafts]);

  /**
   * What Overwrite would assign right now. Errors are surfaced beside the total rather than
   * swallowed.
   */
  const preview = useMemo(() => {
    if (!parsed.ok) return null;
    return applyTemplates({
      month,
      envelopes: [{ ...envelope, templates: parsed.templates }],
      bills: new Map(),
      readyToAssignCents,
      force: true,
      todayKey,
    });
  }, [parsed, envelope, month, readyToAssignCents, todayKey]);

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
          run <strong className="font-medium text-ink">Assign → Underfunded</strong> —
          this list only says what that option should fund.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="rounded border border-rule bg-surface-raised px-3 py-2"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  {lineLabel(draft)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                  {lineSummary(draft)}
                </span>
                <button
                  type="button"
                  onClick={() => edit(drafts.filter((row) => row.id !== draft.id))}
                  title={`Remove this ${lineLabel(draft).toLowerCase()} line`}
                  className="min-h-tap flex-none rounded px-2 text-[0.75rem] text-ink-muted hover:bg-surface hover:text-ink md:min-h-0"
                >
                  Remove
                </button>
              </div>

              <DraftFields
                draft={draft}
                month={month}
                todayKey={todayKey}
                envelopeId={envelope.id}
                history={history}
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
              {ADD_LABELS[type]}
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

/** The line's eyebrow. A weekly line names its own weekday rather than saying "weekday". */
function lineLabel(draft: Draft): string {
  if (draft.type === "weekly") return `Amount each ${weekdayLongLabel(draft.weekday)}`;
  return TYPE_LABELS[draft.type];
}

function lineSummary(draft: Draft): string {
  const single = draftsToTemplates([draft]);
  if (!single.ok) return "Incomplete";
  return summarize(single.templates[0]);
}

function DraftFields({
  draft,
  month,
  todayKey,
  envelopeId,
  history,
  onChange,
}: {
  draft: Draft;
  month: MonthKey;
  todayKey: string;
  envelopeId: string;
  history: readonly AssignHistoryMonth[];
  onChange: (patch: Partial<Draft>) => void;
}) {
  switch (draft.type) {
    case "simple":
      return <SimpleFields draft={draft} onChange={onChange} />;
    case "weekly":
      return (
        <WeeklyFields
          draft={draft}
          month={month}
          todayKey={todayKey}
          envelopeId={envelopeId}
          history={history}
          onChange={onChange}
        />
      );
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
        Add every month
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
        Keep available
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
              ? "Set a Keep available amount first — hold only means anything with one"
              : "Keep money already over that amount instead of assigning it away"
          }
        >
          Hold what is over
        </span>
      </label>
      <p className="w-full text-[0.75rem] text-ink-faint">
        <em>Add every month</em> is a contribution: this month costs that much, and
        anything left over stays put until you move it. <em>Keep available</em> is a
        balance: what is already sitting here counts toward it, so a quiet month asks
        for less. Leave <em>Add every month</em> blank to use the balance alone.
      </p>
    </div>
  );
}

/**
 * Weekday plus a per-occurrence amount — the whole line (D4).
 *
 * The suggestion divides *all* spending in the envelope by the weekday occurrences over the
 * same months, and says so: the mid-week milk run is real demand on this envelope, and a
 * figure drawn from the anchor-day receipts alone would underfund it every month.
 */
function WeeklyFields({
  draft,
  month,
  todayKey,
  envelopeId,
  history,
  onChange,
}: {
  draft: WeeklyDraft;
  month: MonthKey;
  todayKey: string;
  envelopeId: string;
  history: readonly AssignHistoryMonth[];
  onChange: (patch: Partial<WeeklyDraft>) => void;
}) {
  const suggested = useMemo(
    () =>
      suggestWeeklyAmountCents({
        history,
        categoryId: envelopeId,
        weekday: draft.weekday,
        currentMonth: monthKeyOf(todayKey),
      }),
    [history, envelopeId, draft.weekday, todayKey],
  );

  const occurrences = countWeekdayInMonth(month, draft.weekday);
  const dayName = weekdayLongLabel(draft.weekday);
  const single = draftsToTemplates([draft]);
  const amountCents =
    single.ok && single.templates[0].type === "weekly"
      ? single.templates[0].amountCents
      : null;

  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <label className={labelClass}>
        Day of the week
        <select
          value={draft.weekday}
          onChange={(event) => onChange({ weekday: Number(event.target.value) })}
          className={inputClass}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
            <option key={weekday} value={weekday}>
              {weekdayLongLabel(weekday)}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Each {dayName}
        <input
          type="text"
          inputMode="decimal"
          value={draft.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          className={`tabular w-32 text-right ${inputClass}`}
        />
      </label>
      <p className="w-full text-[0.75rem] text-ink-faint">
        {suggested === null
          ? `${monthLabel(month)} has ${occurrences} ${dayName}s, so it asks for ${occurrences} × this amount. Not enough history yet to suggest one.`
          : `History suggests ${formatUsd(suggested)} — all spending in this envelope, not only the ${dayName} trips, divided by its ${dayName}s. ${monthLabel(month)} has ${occurrences}.`}
      </p>
      {amountCents === null ? null : (
        <p className="w-full text-[0.75rem] text-ink-muted">
          {monthLabel(month)}: {occurrences} {dayName}s × {formatUsd(amountCents)} ={" "}
          <span className="tabular text-ink">
            {formatUsd(amountCents * occurrences)}
          </span>
        </p>
      )}
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
