"use client";

import { useId, useMemo, useState, useTransition } from "react";

import { saveEnvelopeTargetAction } from "@/app/finances/actions";
import {
  Drawer,
  DrawerFooter,
  DrawerHeader,
  DrawerLeaveGuard,
} from "@/components/detail/Drawer";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { weekdayLongLabel } from "@/lib/dateFormat";
import type { AssignHistoryMonth } from "@/lib/finances/budget/assign/types";
import {
  monthKeyOf,
  monthLabel,
  monthName,
  type MonthKey,
} from "@/lib/finances/budget/envelope";
import { wholeOccurrences } from "@/lib/finances/budget/targets/cadence";
import { targetDemand } from "@/lib/finances/budget/targets/demand";
import { resolveTarget, type BillSnapshot } from "@/lib/finances/budget/targets/derive";
import { suggestWeeklyAmountCents } from "@/lib/finances/budget/templates/suggest";
import {
  isLegalPairing,
  parseTarget,
  summarize,
  type Cadence,
  type CadenceUnit,
  type Target,
  type TargetBehavior,
} from "@/lib/finances/budget/targets/types";
import type { EnvelopeApplyInput } from "@/lib/finances/budget/templates/apply";
import { formatUsd, parseAmountEntryCents } from "@/lib/finances/money";

const inputClass =
  "min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:py-1 md:text-[0.8125rem]";

const labelClass = "flex flex-col gap-1 text-[0.75rem] text-ink-muted";

type CadenceChoice = Exclude<CadenceUnit, "schedule">;

type Draft = {
  behavior: TargetBehavior;
  unit: CadenceChoice;
  weekday: number;
  day: number;
  yearMonth: number;
  byMonth: string;
  amount: string;
};

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function defaultDraft(envelope: EnvelopeApplyInput): Draft {
  if (envelope.target) return draftFromTarget(envelope.target);
  if (envelope.kind === "savings") {
    return {
      behavior: "add",
      unit: "month",
      weekday: 0,
      day: 31,
      yearMonth: 12,
      byMonth: "",
      amount: "",
    };
  }
  return {
    behavior: "upTo",
    unit: "month",
    weekday: 0,
    day: 31,
    yearMonth: 12,
    byMonth: "",
    amount: "",
  };
}

function draftFromTarget(target: Target): Draft {
  const cadence = target.cadence;
  return {
    behavior: target.behavior,
    unit: cadence.unit === "schedule" ? "month" : cadence.unit,
    weekday: cadence.unit === "week" ? cadence.weekday : 0,
    day: cadence.unit === "month" ? cadence.day : 31,
    yearMonth: cadence.unit === "year" ? cadence.month : 12,
    byMonth: cadence.unit === "by" ? cadence.month : "",
    amount: dollars(target.amountCents),
  };
}

function cadenceOf(draft: Draft): Cadence | null {
  switch (draft.unit) {
    case "week":
      return { unit: "week", weekday: draft.weekday };
    case "month":
      return { unit: "month", day: draft.day };
    case "year":
      return { unit: "year", month: draft.yearMonth };
    case "by":
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(draft.byMonth)
        ? { unit: "by", month: draft.byMonth }
        : null;
    case "none":
      return { unit: "none" };
  }
}

function behaviorsFor(unit: CadenceChoice): TargetBehavior[] {
  return (["add", "upTo", "balance", "save"] as const).filter((behavior) =>
    isLegalPairing(behavior, unit),
  );
}

type Job = { label: string; hint: string };

/**
 * What each job is, and what happens to the envelope once the money is spent.
 *
 * The hint is not decoration. Between a floor and a goal it is the *whole* difference, and the
 * labels alone could not carry it: they used to read "Have this amount available **by a month**"
 * against "Save this amount in total, then it's done", so the pair looked like a choice about
 * timing. It is not — "How often" sits directly above and its deadline applies to either job.
 * Naming the deadline on one option and not the other is what hid that `save` + `by` exists at
 * all, which is the combination someone saving for a dated trip actually wants.
 *
 * So neither `by` nor `none` mentions its cadence, and the two share their strings.
 *
 * Spec: `agent-os/specs/2026-09-07-1210-the-job-names-what-happens-after/` D1, D2, superseding
 * `agent-os/specs/2026-09-07-0804-one-time-savings-goal/` D1's wording.
 */
function job(behavior: TargetBehavior, unit: CadenceChoice): Job {
  // `add` and `upTo` keep the labels they already had — nobody has found those unclear, and the
  // hint is enough to make the set uniform.
  switch (unit) {
    case "week":
      return behavior === "add"
        ? {
            label: "Add this amount each weekday",
            hint: "On top of whatever is already there",
          }
        : {
            label: "Have this amount available each weekday",
            hint: "What is left over counts toward it, so you top up the difference",
          };
    case "month":
      return behavior === "add"
        ? {
            label: "Add this amount every month",
            hint: "On top of whatever is already there",
          }
        : {
            label: "Have this amount available each month",
            hint: "What is left over counts toward it, so you top up the difference",
          };
    case "year":
      return {
        label: "Have this amount available each year",
        hint: "Saves toward it a month at a time, then starts over for next year",
      };
    case "by":
    case "none":
      return behavior === "save"
        ? {
            label: "Save this amount, then spend it",
            hint: "Spending it completes the goal — a trip, a down payment",
          }
        : {
            // No use case named, deliberately. This hint used to say "a car-repair or medical
            // fund" and that is the one case it has been shown wrong for: a $5,000 fund with a
            // $2,000 repair charged to it asks the whole $2,000 back this month and puts it in
            // the header's "still needed". A floor genuinely should be rebuilt — unlike a goal —
            // but not necessarily all in one month, and there is no way to say how fast yet.
            // Until there is, state the sharp edge rather than recommend the shape
            // (`a-floor-rebuilds-all-at-once` D2).
            label: "Keep this amount available",
            hint: "Spending it asks that money back the same month, all at once",
          };
  }
}

function targetFromDraft(draft: Draft): Target | null {
  const cadence = cadenceOf(draft);
  if (!cadence) return null;
  const amountCents = parseAmountEntryCents(draft.amount);
  if (amountCents === null || amountCents <= 0) return null;
  return parseTarget({ behavior: draft.behavior, cadence, amountCents });
}

/**
 * One target, one form. Cadence first, then the job as a sentence from D2, then the amount.
 * Never a refill/set-aside toggle.
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D7, Task 9.
 */
export function TargetDrawer({
  envelope,
  month,
  todayKey,
  history,
  bills,
  onClose,
  onSaved,
}: {
  envelope: EnvelopeApplyInput;
  month: MonthKey;
  todayKey: string;
  history: readonly AssignHistoryMonth[];
  bills: ReadonlyMap<string, BillSnapshot>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const formatDate = useDateFormatter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const derived = envelope.kind === "bill" && envelope.target === null;
  const [overriding, setOverriding] = useState(!derived);
  const [draft, setDraft] = useState<Draft>(() => defaultDraft(envelope));
  const baseline = useMemo(() => JSON.stringify(defaultDraft(envelope)), [envelope]);
  const dirty = overriding !== !derived || JSON.stringify(draft) !== baseline;

  // A target keeps the day it started; a brand-new one starts today. Anchors before that day
  // are not this target's to ask for, and it is the only thing that trims a month's cap. The
  // preview has to apply the same rule `saveEnvelopeTarget` will, or it previews a different
  // target from the one the Save button writes (`target-refill-basis` D2).
  const since = envelope.target ? envelope.target.since : todayKey;
  const draftTarget = targetFromDraft(draft);
  const parsed = draftTarget
    ? { ...draftTarget, ...(since ? { since } : {}) }
    : draftTarget;
  // The contribution basis the preview reads. With a stored target the row's number already
  // counts from the `since` this save preserves, so it is the truth. With none, the target
  // starts today: what it has contributed is exactly this envelope's carry-in, and Assigned is
  // added by the bar rather than the basis. Same rule as `since` above, for the same reason.
  const contributedBeforeCents = envelope.target
    ? envelope.contributedBeforeCents
    : envelope.carryInCents;
  const previewing = {
    ...envelope,
    contributedBeforeCents,
    target: overriding ? parsed : envelope.target,
  };
  const demand = targetDemand(previewing, month, bills);
  const resolved = resolveTarget(previewing, bills);

  const suggested =
    draft.unit === "week"
      ? suggestWeeklyAmountCents({
          history,
          categoryId: envelope.id,
          weekday: draft.weekday,
          currentMonth: monthKeyOf(todayKey),
        })
      : null;

  function patch(update: Partial<Draft>) {
    setSaved(false);
    setDraft((current) => {
      const next = { ...current, ...update };
      const allowed = behaviorsFor(next.unit);
      if (!allowed.includes(next.behavior)) {
        next.behavior = allowed[0] ?? "upTo";
      }
      return next;
    });
  }

  function persist(closeAfter: boolean) {
    setError(null);
    if (overriding && !parsed) {
      setError("Enter a valid amount for this target.");
      return;
    }
    startTransition(async () => {
      const result = await saveEnvelopeTargetAction(
        envelope.id,
        overriding ? parsed : null,
      );
      if (!result.ok) {
        setError(result.error ?? "Could not save the target.");
        return;
      }
      setSaved(true);
      onSaved();
      if (closeAfter) onClose();
    });
  }

  const periodCadence =
    parsed && (parsed.cadence.unit === "week" || parsed.cadence.unit === "month")
      ? parsed.cadence
      : null;
  const count = periodCadence
    ? wholeOccurrences(periodCadence, month, undefined, since)
    : null;
  // `since` only silences a month the target did not exist for; the month it started in asks
  // its whole cap, so the note has one job — explaining a zero.
  const beforeStart = count === 0 && Boolean(since);

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        title={envelope.name}
        eyebrow="Envelope target"
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-3">
        {derived && !overriding ? (
          <DerivedPanel
            envelope={envelope}
            bills={bills}
            onOverride={() => {
              setOverriding(true);
              setSaved(false);
            }}
          />
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              persist(false);
            }}
          >
            <label className={labelClass}>
              How often
              <select
                value={draft.unit}
                onChange={(event) =>
                  patch({ unit: event.target.value as CadenceChoice })
                }
                className={inputClass}
              >
                <option value="week">Each weekday</option>
                <option value="month">Each month</option>
                <option value="year">Each year</option>
                <option value="by">By a month</option>
                <option value="none">No deadline</option>
              </select>
            </label>

            {draft.unit === "week" ? (
              <label className={labelClass}>
                Day of the week
                <select
                  value={draft.weekday}
                  onChange={(event) => patch({ weekday: Number(event.target.value) })}
                  className={inputClass}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
                    <option key={weekday} value={weekday}>
                      {weekdayLongLabel(weekday)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {draft.unit === "year" ? (
              <label className={labelClass}>
                Needed by
                <select
                  value={draft.yearMonth}
                  onChange={(event) => patch({ yearMonth: Number(event.target.value) })}
                  className={inputClass}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (monthNumber) => (
                      <option key={monthNumber} value={monthNumber}>
                        {monthName(`2000-${String(monthNumber).padStart(2, "0")}-01`)}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ) : null}

            {draft.unit === "by" ? (
              <label className={labelClass}>
                By month
                <input
                  type="month"
                  value={draft.byMonth}
                  onChange={(event) => patch({ byMonth: event.target.value })}
                  className={inputClass}
                />
              </label>
            ) : null}

            <fieldset className="flex flex-col gap-2">
              <legend className="text-[0.75rem] text-ink-muted">The job</legend>
              {behaviorsFor(draft.unit).map((behavior) => {
                const { label, hint } = job(behavior, draft.unit);
                return (
                  <label
                    key={behavior}
                    className="flex items-start gap-2 text-[0.8125rem] text-ink"
                  >
                    <input
                      type="radio"
                      name="target-job"
                      className="mt-[0.2rem]"
                      checked={draft.behavior === behavior}
                      onChange={() => patch({ behavior })}
                    />
                    <span className="flex flex-col">
                      <span>{label}</span>
                      <span className="text-[0.75rem] text-ink-faint">{hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <label className={labelClass}>
              Amount
              <input
                type="text"
                inputMode="decimal"
                value={draft.amount}
                onChange={(event) => patch({ amount: event.target.value })}
                className={`tabular w-32 text-right ${inputClass}`}
              />
            </label>

            {draft.unit === "week" ? (
              <p className="text-[0.75rem] text-ink-faint">
                {suggested === null
                  ? `Not enough history yet to suggest a per-${weekdayLongLabel(draft.weekday)} amount.`
                  : `History suggests ${formatUsd(suggested)} — all spending in this envelope, not only the ${weekdayLongLabel(draft.weekday)} trips, divided by its ${weekdayLongLabel(draft.weekday)}s.`}
              </p>
            ) : null}

            {parsed && periodCadence && count !== null ? (
              <p className="text-[0.75rem] text-ink-muted">
                {monthLabel(month)}:{" "}
                {periodCadence.unit === "week"
                  ? `${count} ${weekdayLongLabel(periodCadence.weekday)}${count === 1 ? "" : "s"} × ${formatUsd(parsed.amountCents)} = `
                  : ""}
                {formatUsd(parsed.amountCents * count)}.
                {beforeStart && since
                  ? ` Nothing — this target started ${formatDate(since)}.`
                  : ""}
              </p>
            ) : null}

            {derived ? (
              <button
                type="button"
                className="self-start text-[0.75rem] text-ink-muted underline"
                onClick={() => {
                  setOverriding(false);
                  setSaved(false);
                }}
              >
                Use the bill&apos;s own cadence again
              </button>
            ) : (
              <button
                type="button"
                className="self-start text-[0.75rem] text-ink-muted underline"
                onClick={() => {
                  setDraft({
                    ...draft,
                    amount: "",
                  });
                  startTransition(async () => {
                    const result = await saveEnvelopeTargetAction(envelope.id, null);
                    if (!result.ok) {
                      setError(result.error ?? "Could not clear the target.");
                      return;
                    }
                    onSaved();
                    onClose();
                  });
                }}
              >
                Remove target
              </button>
            )}
          </form>
        )}

        <p className="text-[0.8125rem] text-ink">
          {resolved.target
            ? `${summarize(resolved.target)}. This month asks ${formatUsd(demand.amount)}.`
            : "No target."}
        </p>
      </div>
      <DrawerLeaveGuard dirty={dirty} />
      <DrawerFooter
        onSave={() => persist(false)}
        onSaveAndClose={() => persist(true)}
        onClose={onClose}
        saving={pending}
        dirty={dirty}
        justSaved={saved}
        error={error}
      />
    </Drawer>
  );
}

function DerivedPanel({
  envelope,
  bills,
  onOverride,
}: {
  envelope: EnvelopeApplyInput;
  bills: ReadonlyMap<string, BillSnapshot>;
  onOverride: () => void;
}) {
  const resolved = resolveTarget(envelope, bills);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.8125rem] text-ink">
        {resolved.target
          ? `${summarize(resolved.target)}. This is the bill's own cadence — it stays in sync when the amount or due day changes.`
          : (resolved.errors[0] ?? "This bill has no target yet.")}
      </p>
      <button
        type="button"
        className="self-start text-[0.75rem] text-ink-muted underline"
        onClick={onOverride}
      >
        Set my own target
      </button>
    </div>
  );
}
