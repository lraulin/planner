"use client";

/** Shared toolbar chrome for the Projects / Tasks / Goals / Wish List tabs. */

/**
 * Below `md` the toolbar stops wrapping and scrolls sideways instead.
 *
 * Wrapping was costing four rows and a fifth of a 390px screen before a single task was
 * visible. One row that pans is the trade `responsive.md` asks for: wide content scrolls
 * inside its own container rather than eating the view.
 *
 * `pinned` sits **outside** that scroller, against the right edge. The `⋯` overflow goes
 * there because it is the phone's only path to the view's commands, and a command surface
 * you reach by panning 1900px of other controls is one you do not have — which is what it
 * was, measured, before this existed.
 */
export function TabToolbar({
  children,
  pinned,
}: {
  children: React.ReactNode;
  pinned?: React.ReactNode;
}) {
  return (
    <div className="flex flex-none items-stretch border-b border-rule">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-4 gap-y-2 overflow-x-auto px-3 py-2 md:flex-wrap md:overflow-x-visible">
        {children}
      </div>

      {pinned && (
        <div className="flex flex-none items-center border-l border-rule px-2 py-2 md:border-l-0 md:pl-0">
          {pinned}
        </div>
      )}
    </div>
  );
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
