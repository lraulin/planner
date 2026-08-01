"use client";

import type {
  RecurrenceEnd,
  RecurrenceFrequency,
  RecurrenceMode,
  RecurrencePattern,
  TaskDetails,
} from "@/db/schema";
import { describeRule, nextOccurrence } from "@/lib/recurrence/pattern";
import { nextDue } from "@/lib/recurrence/nextDue";
import { DateField, FieldGrid, NumberField, Section, SelectField } from "./fields";

/**
 * Achieve's Recurrence dialog (manual §3.9), inline on the Task drawer's General tab.
 *
 * Every frequency offers the same two shapes the manual distinguishes: a **date pattern**
 * that follows a fixed calendar ("every two weeks on a Friday" lands on the Friday no
 * matter when you finished the last one) and a **regeneration** pattern measured from the
 * completion ("five days after completion"). Achieve makes Regenerate a radio alongside
 * the pattern radios, so choosing it excludes them — modelled here as a Mode select that
 * hides the pattern controls, and enforced by a check constraint on `task_details`.
 *
 * A dialog would be closer to Achieve visually, but `components/ux-principles` allows
 * modals only for destructive confirmations, blocking decisions and fast capture. This is
 * routine editing bound to a record, so it stays in the drawer.
 */

const FREQUENCY_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: "none", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const MODE_OPTIONS: { value: RecurrenceMode; label: string }[] = [
  { value: "scheduled", label: "On a fixed schedule" },
  { value: "regenerate", label: "After each completion" },
];

/** The pattern radios Achieve offers on each of its four tabs. */
const PATTERN_OPTIONS: Record<
  Exclude<RecurrenceFrequency, "none">,
  { value: RecurrencePattern; label: string }[]
> = {
  daily: [
    { value: "interval", label: "Every N days" },
    { value: "weekday", label: "Every weekday" },
    { value: "weekend", label: "Every weekend day" },
  ],
  weekly: [
    { value: "by_weekday", label: "On chosen days" },
    { value: "interval", label: "Every N weeks" },
  ],
  monthly: [
    { value: "by_month_day", label: "On a day of the month" },
    { value: "by_ordinal", label: "On the first…last weekday" },
    { value: "interval", label: "Every N months" },
  ],
  yearly: [
    { value: "by_month_day", label: "On a date" },
    { value: "by_ordinal", label: "On the first…last weekday" },
    { value: "interval", label: "Every N years" },
  ],
};

const END_OPTIONS: { value: RecurrenceEnd; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "count", label: "After a number of times" },
  { value: "until", label: "On a date" },
];

const ORDINAL_OPTIONS = [
  { value: "1", label: "First" },
  { value: "2", label: "Second" },
  { value: "3", label: "Third" },
  { value: "4", label: "Fourth" },
  { value: "-1", label: "Last" },
];

const WEEKDAY_OPTIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
  (label, index) => ({ value: String(index), label }),
);

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1), label }));

const INTERVAL_SUFFIX: Record<RecurrenceFrequency, string> = {
  none: "",
  daily: "days",
  weekly: "weeks",
  monthly: "months",
  yearly: "years",
};

type Task = Partial<Omit<TaskDetails, "nodeId">>;

/**
 * The rule as the engine wants it, read straight off the draft so the preview below the
 * fields is computed by exactly the code that will run on completion.
 */
function ruleOf(task: Task) {
  return {
    frequency: task.recurrenceFrequency ?? "none",
    interval: task.recurrenceInterval ?? 1,
    pattern: task.recurrencePattern ?? "interval",
    byWeekday: task.recurrenceByWeekday ?? null,
    monthDay: task.recurrenceMonthDay ?? null,
    ordinal: task.recurrenceOrdinal ?? null,
    weekday: task.recurrenceWeekday ?? null,
    month: task.recurrenceMonth ?? null,
  };
}

/**
 * Sensible values for the fields a newly chosen pattern needs, taken from the date the
 * rule will actually be anchored on.
 *
 * Without this, picking "Weekly / on chosen days" leaves the weekday set empty — a rule
 * the engine cannot satisfy, which would quietly finish the task instead of repeating it.
 * Achieve does the same thing: its dialog opens with the start date's own weekday ticked.
 */
function defaultsFor(pattern: RecurrencePattern, anchor: Date): Task {
  switch (pattern) {
    case "by_weekday":
      return { recurrenceByWeekday: [anchor.getDay()] };
    case "by_month_day":
      return {
        recurrenceMonthDay: anchor.getDate(),
        recurrenceMonth: anchor.getMonth() + 1,
      };
    case "by_ordinal":
      return {
        recurrenceOrdinal: Math.min(4, Math.ceil(anchor.getDate() / 7)),
        recurrenceWeekday: anchor.getDay(),
        recurrenceMonth: anchor.getMonth() + 1,
      };
    default:
      return {};
  }
}

export function RecurrenceFields({
  task,
  deadline,
  patchTask,
  onSkip,
}: {
  task: Task;
  /** Lives on `nodes`, but it is the first choice of anchor, so the preview needs it. */
  deadline: Date | null;
  patchTask: (changes: Task) => void;
  /** Achieve's Skip Recurrence. Saves and re-reads on its own — it is not part of the draft. */
  onSkip: () => void;
}) {
  const frequency = task.recurrenceFrequency ?? "none";
  const mode = task.recurrenceMode ?? "scheduled";
  const pattern = task.recurrencePattern ?? "interval";
  const end = task.recurrenceEnd ?? "never";
  const rule = ruleOf(task);

  // The same precedence `applyStateTransition` uses, so the preview cannot disagree with
  // what completing the task will actually do.
  const anchor = deadline ?? task.deferredDate ?? task.targetStartDate ?? new Date();

  const next =
    frequency === "none"
      ? null
      : mode === "regenerate"
        ? nextDue(new Date(), frequency, rule.interval)
        : nextOccurrence(rule, anchor);

  function setFrequency(value: RecurrenceFrequency) {
    if (value === "none") {
      patchTask({ recurrenceFrequency: "none" });
      return;
    }
    // Land on the frequency's own first pattern, with its fields filled in.
    const first = PATTERN_OPTIONS[value][0].value;
    const nextPattern = mode === "regenerate" ? "interval" : first;
    patchTask({
      recurrenceFrequency: value,
      recurrencePattern: nextPattern,
      ...defaultsFor(nextPattern, anchor),
    });
  }

  function setMode(value: RecurrenceMode) {
    // Regenerating excludes the calendar patterns — the check constraint says so too.
    if (value === "regenerate") {
      patchTask({ recurrenceMode: value, recurrencePattern: "interval" });
      return;
    }
    patchTask({ recurrenceMode: value });
  }

  function setPattern(value: RecurrencePattern) {
    patchTask({
      recurrencePattern: value,
      // "Every 2 weekdays" has no meaning, and the database refuses it.
      ...(value === "weekday" || value === "weekend" ? { recurrenceInterval: 1 } : {}),
      ...defaultsFor(value, anchor),
    });
  }

  /**
   * The end condition carries its own value, seeded here rather than only shown as a
   * default in the field. A shown-but-unwritten "10" is the worst of both: the form says
   * the series ends after ten and the database says it ends after none.
   */
  function setEnd(value: RecurrenceEnd) {
    if (value === "count" && task.recurrenceCount == null) {
      patchTask({ recurrenceEnd: value, recurrenceCount: 10 });
      return;
    }
    if (value === "until" && task.recurrenceUntil == null) {
      patchTask({ recurrenceEnd: value, recurrenceUntil: next ?? new Date() });
      return;
    }
    patchTask({ recurrenceEnd: value });
  }

  function toggleWeekday(day: number) {
    const current = task.recurrenceByWeekday ?? [];
    const nextDays = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    patchTask({ recurrenceByWeekday: nextDays });
  }

  const showInterval =
    frequency !== "none" &&
    (mode === "regenerate" ||
      pattern === "interval" ||
      pattern === "by_weekday" ||
      pattern === "by_month_day" ||
      pattern === "by_ordinal");

  return (
    <Section title="Recurrence">
      <FieldGrid columns={3}>
        <SelectField
          label="Repeats"
          value={frequency}
          options={FREQUENCY_OPTIONS}
          onChange={(value) => setFrequency(value ?? "none")}
        />
        {frequency !== "none" && (
          <SelectField
            label="Next date is set"
            value={mode}
            options={MODE_OPTIONS}
            onChange={(value) => setMode(value ?? "scheduled")}
            hint={
              mode === "regenerate"
                ? "Counted from when you finish it. Doing it twice today still leaves tomorrow."
                : "A fixed calendar series. Finishing early buys time; missing one still owes it."
            }
          />
        )}
        {showInterval && (
          <NumberField
            label="Every"
            value={task.recurrenceInterval ?? 1}
            onChange={(value) => patchTask({ recurrenceInterval: value ?? 1 })}
            min={1}
            max={999}
            suffix={INTERVAL_SUFFIX[frequency]}
          />
        )}
      </FieldGrid>

      {frequency !== "none" && mode === "scheduled" && (
        <FieldGrid columns={3}>
          <SelectField
            label="Pattern"
            value={pattern}
            options={PATTERN_OPTIONS[frequency]}
            onChange={(value) => setPattern(value ?? "interval")}
          />

          {pattern === "by_month_day" && (
            <NumberField
              label="Day of month"
              value={task.recurrenceMonthDay ?? 1}
              onChange={(value) => patchTask({ recurrenceMonthDay: value ?? 1 })}
              min={1}
              max={31}
              hint="A short month clamps to its last day."
            />
          )}

          {pattern === "by_ordinal" && (
            <>
              <SelectField
                label="Which"
                value={String(task.recurrenceOrdinal ?? 1)}
                options={ORDINAL_OPTIONS}
                onChange={(value) =>
                  patchTask({ recurrenceOrdinal: Number(value ?? "1") })
                }
              />
              <SelectField
                label="Weekday"
                value={String(task.recurrenceWeekday ?? 0)}
                options={WEEKDAY_OPTIONS}
                onChange={(value) =>
                  patchTask({ recurrenceWeekday: Number(value ?? "0") })
                }
              />
            </>
          )}

          {frequency === "yearly" && pattern !== "interval" && (
            <SelectField
              label="Month"
              value={String(task.recurrenceMonth ?? 1)}
              options={MONTH_OPTIONS}
              onChange={(value) => patchTask({ recurrenceMonth: Number(value ?? "1") })}
            />
          )}
        </FieldGrid>
      )}

      {frequency !== "none" && mode === "scheduled" && pattern === "by_weekday" && (
        <WeekdayPicker
          selected={task.recurrenceByWeekday ?? []}
          onToggle={toggleWeekday}
        />
      )}

      {frequency !== "none" && (
        <FieldGrid columns={3}>
          <SelectField
            label="Ends"
            value={end}
            options={END_OPTIONS}
            onChange={(value) => setEnd(value ?? "never")}
            hint="When a series ends, the last completion finishes the task for good."
          />
          {end === "count" && (
            <NumberField
              label="Times"
              value={task.recurrenceCount ?? 10}
              onChange={(value) => patchTask({ recurrenceCount: value ?? 1 })}
              min={1}
              max={9999}
              suffix="occurrences"
            />
          )}
          {end === "until" && (
            <DateField
              label="Last date"
              value={task.recurrenceUntil ?? null}
              onChange={(value) => patchTask({ recurrenceUntil: value })}
            />
          )}
        </FieldGrid>
      )}

      {frequency !== "none" && (
        <RulePreview
          summary={describeRule(rule, mode)}
          lastCompleted={task.dateCompleted ?? null}
          next={next}
          onSkip={onSkip}
        />
      )}
    </Section>
  );
}

/**
 * Toggle buttons rather than checkboxes: below `md` there is no hover and no keyboard, and
 * `ux-principles` keeps hit-target size outside the accessibility exemption, so each day
 * needs a real tap target of its own.
 */
function WeekdayPicker({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (day: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        On
      </span>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_OPTIONS.map((day) => {
          const on = selected.includes(Number(day.value));
          return (
            <button
              key={day.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(Number(day.value))}
              className={`min-h-tap min-w-tap rounded border px-3 text-[0.8125rem] transition-colors md:min-h-0 md:min-w-0 md:py-1.5 ${
                on
                  ? "border-select-edge bg-select text-ink"
                  : "border-rule bg-surface text-ink-muted hover:text-ink"
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What the rule means and what it will do next.
 *
 * This exists because the feature is otherwise invisible: completing a repeating task
 * un-ticks it and moves its dates, which without a stated "next occurrence" reads as the
 * app having ignored the click.
 */
function RulePreview({
  summary,
  lastCompleted,
  next,
  onSkip,
}: {
  summary: string;
  lastCompleted: Date | null;
  next: Date | null;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-rule bg-surface-raised px-3 py-2">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[0.8125rem] sm:grid-cols-3">
        <Fact term="Rule" value={summary} />
        <Fact
          term="Last completed"
          value={lastCompleted ? dateText(lastCompleted) : "Never"}
        />
        <Fact
          term="Next occurrence"
          value={next ? dateText(next) : "Series has ended"}
        />
      </dl>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSkip}
          disabled={!next}
          className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink-muted transition-colors hover:text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Skip this occurrence
        </button>
        <p className="text-[0.75rem] text-ink-faint">
          Moves the dates on without doing it. Nothing is logged as completed.
        </p>
      </div>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[0.6875rem] uppercase tracking-wider text-ink-faint">
        {term}
      </dt>
      <dd className="tabular text-ink">{value}</dd>
    </div>
  );
}

/** Matches how `DateField` renders a stored date, so the two never disagree on screen. */
function dateText(date: Date): string {
  return date.toISOString().slice(0, 10);
}
