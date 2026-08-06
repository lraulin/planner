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
 * looking at", which the grid itself is already showing you. ~28px is the price and it buys a bar
 * that can be read in one sweep.
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
  /** Row 1: menu bar, icon segments, selection context. Desktop only. */
  commandRow?: React.ReactNode;
  /** Row 2: the lens — view picker, scope, search, filter, grouping, density. */
  children: React.ReactNode;
  /** Sits outside the lens scroller, against the right edge. `⋯` lives here. */
  pinned?: React.ReactNode;
}) {
  return (
    <div className="flex flex-none flex-col border-b border-rule">
      {commandRow && (
        <div className="hidden min-w-0 max-w-full items-center gap-2 border-b border-rule px-3 py-1.5 md:flex">
          {commandRow}
        </div>
      )}

      <div className="flex min-w-0 max-w-full items-stretch overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-4 gap-y-2 overflow-x-auto px-3 py-2 md:flex-wrap md:overflow-x-visible">
          {children}
        </div>

        {/*
          `⋯` is phone-only now. Above `md` the named menus are right there on the command row, and
          a third button reprinting all of them is the clutter this replaced — the overflow tier
          exists because a 390px screen has no menu bar and no `⌘K`, not because a desktop needs a
          second way in.
        */}
        {pinned && (
          <div className="flex flex-none items-center border-l border-rule px-2 py-2 md:hidden">
            {pinned}
          </div>
        )}
      </div>
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
