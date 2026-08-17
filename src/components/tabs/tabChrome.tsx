"use client";

import type { CommandIcon } from "@/lib/commands/icons";
import { CommandGlyph } from "@/components/icons/commandIcons";

/** Shared toolbar chrome for every grid tab. */

/**
 * The two-row header: **verbs** above, **lens** below.
 *
 * One row held both and the result was a flat run of identically-bordered controls where `New` and
 * `Rename` sat between `Group by` and `Density` with nothing to say which was which. Zoning one row
 * was tried on paper and does not survive the real width: a view picker, two scope selects, search,
 * Filter, two Group by levels, switches and Density already fill 1280px, so the two zones collide
 * and wrap into each other unpredictably.
 *
 * Verbs first because "what can I do" is the question you arrive with; the lens answers "what am I
 * looking at" and sits on the grid so Filter / Group / Search stay next to the rows they change.
 * That is not Achieve's toolbar-under-the-menu order — `navigation.md`. ~28px is the price and it
 * buys a bar that can be read in one sweep.
 *
 * Below `md` there is **one** row, the lens, panning sideways with `⋯` pinned outside the scroller.
 * The verbs are all inside `⋯` down there — `responsive.md`, adaptive not shrunken: two rows on a
 * 390px screen would cost a fifth of it before a single task was visible.
 */
export function TabToolbar({
  commandRow,
  children,
  pinned,
}: {
  /** Row 1: page verb row — icon segments and selection context. Desktop only. */
  commandRow?: React.ReactNode;
  /**
   * Row 2: the lens — view picker, scope, search, filter, grouping, density.
   *
   * Optional, because a module can have no lens at all. Fitness is the case: once
   * `Sessions | Exercises` left for the page bar it had nothing to filter or group, and an empty
   * 36px strip below the menus reads as a control that failed to load.
   */
  children?: React.ReactNode;
  /** Sits outside the lens scroller, against the right edge. `⋯` lives here. */
  pinned?: React.ReactNode;
}) {
  const hasLens = Boolean(children);

  return (
    <div className="flex flex-none flex-col border-b border-rule">
      {commandRow && (
        <div className="hidden min-w-0 max-w-full items-center gap-2 border-b border-rule px-3 py-1.5 md:flex">
          {commandRow}
        </div>
      )}

      {/*
        With no lens the row exists only to carry `⋯`, which is phone-only — so above `md` it
        does not exist either, rather than ruling off an empty strip.
      */}
      {(hasLens || pinned) && (
        <div
          className={`flex min-w-0 max-w-full items-stretch overflow-hidden ${
            hasLens ? "" : "md:hidden"
          }`}
        >
          {hasLens && (
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-4 gap-y-2 overflow-x-auto px-3 py-2 md:flex-wrap md:overflow-x-visible">
              {children}
            </div>
          )}

          {/*
            `⋯` is phone-only now. Above `md` the named menus are right there on the command row, and
            a third button reprinting all of them is the clutter this replaced — the overflow tier
            exists because a 390px screen has no menu bar and no `⌘K`, not because a desktop needs a
            second way in.

            With no lens beside it the button *is* the row, so it drops the divider and the row's
            own padding: on a 390px screen the difference between a 60px strip holding one glyph
            and a 44px one is a visible slice of the list underneath.
          */}
          {pinned && (
            <div
              className={`flex flex-none items-center md:hidden ${
                hasLens ? "border-l border-rule px-2 py-2" : "ml-auto px-2"
              }`}
            >
              {pinned}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The hairline between two icon segments on the command row. */
export function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px flex-none bg-rule" />;
}

export function ToolbarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-none items-center gap-1.5 text-[0.8125rem] text-ink-muted">
      <span className="whitespace-nowrap text-ink-faint">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-tap rounded border border-rule bg-surface px-2 py-1 text-ink outline-none focus:border-select-edge md:min-h-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToolbarToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex min-h-tap flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap text-[0.8125rem] select-none text-ink-muted md:min-h-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 accent-[var(--select-edge)] md:h-3.5 md:w-3.5"
      />
      {label}
    </label>
  );
}

export type ToolbarSegment<T extends string> = {
  value: T;
  label: string;
  /** Why you would pick this one. Worth the words — the labels are one or two each. */
  title?: string;
};

/**
 * A small set of mutually exclusive choices, shown as pressed buttons rather than a `<select>`.
 *
 * Use it when the options are few and fit in a word or two: the current state **is** the pressed
 * button, so the control says what it is doing without spending a label on its own name. A
 * dropdown hides the answer behind a click and then needs a word to say what it is a dropdown of.
 *
 * `label` is for the cases where the buttons genuinely cannot say what dimension they are —
 * "Fit / Decades / Years" needs "Zoom" in front of it, "Roomy / Dense" does not.
 *
 * This was written by hand three times before it was one component (row height, the Insights
 * window and axis, the Timeline presentation), which is the duplication `development/clean-code.md`
 * exists to stop.
 */
export function ToolbarSegments<T extends string>({
  label,
  ariaLabel,
  options,
  value,
  onChange,
}: {
  /** Shown before the buttons. Omit when the labels already name the dimension. */
  label?: string;
  /** The group's accessible name. Defaults to `label`; required when there is none. */
  ariaLabel?: string;
  options: readonly ToolbarSegment<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-none items-center gap-1.5 text-[0.8125rem]">
      {label && <span className="whitespace-nowrap text-ink-faint">{label}</span>}
      <div
        role="group"
        aria-label={ariaLabel ?? label}
        className="flex flex-none overflow-hidden rounded border border-rule"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={[
              "min-h-tap px-2 py-1 text-[0.8125rem] leading-none whitespace-nowrap transition-colors md:min-h-0",
              value === option.value
                ? "bg-select text-ink"
                : "bg-surface text-ink-muted hover:bg-surface-raised hover:text-ink",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="min-h-tap flex-none rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none whitespace-nowrap text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent md:min-h-0"
    >
      {children}
    </button>
  );
}

/**
 * An icon-only button on the command row.
 *
 * Borderless, because a segment of four bordered boxes is the look this replaced — the hairline
 * dividers do the grouping and the glyph does the labelling. `title` **and** `aria-label` are both
 * required by the signature: an icon-only button has no accessible name of its own, and a glyph
 * nobody can name is not a discoverable action (`ux-principles.md`). `title` is also where a
 * disabled button says *why*, which matters more here than anywhere else on the bar.
 */
export function ToolbarIconButton({
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: CommandIcon | undefined;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className="flex h-7 w-7 flex-none items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:bg-transparent"
    >
      <CommandGlyph icon={icon} />
    </button>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex-none border-b border-priority-a/40 bg-priority-a/10 px-4 py-1.5 text-[0.8125rem] text-priority-a"
    >
      {message}
    </p>
  );
}
