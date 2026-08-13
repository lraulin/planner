"use client";

import type { ReactNode } from "react";

/**
 * The shared chrome every insights panel wears, and the stat tile it is often made of.
 *
 * One component rather than a `<section>` copied nine times: the panels differ in what they
 * report, not in how they are framed, and a heading that drifts between panels is the thing
 * a reader notices instead of the numbers.
 */
export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  /** One line saying what the panel answers, or what it cannot see. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded border border-rule bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-rule px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-medium text-ink">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-muted">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </header>
      <div className="min-w-0 flex-1 p-3">{children}</div>
    </section>
  );
}

/**
 * One headline figure.
 *
 * `tone` colours the number and nothing else. Text stays in ink tokens even beside a
 * coloured chart — a figure painted in a series colour reads as a fourth series.
 */
export function StatTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "neutral" | "income" | "spend";
}) {
  const valueClass =
    tone === "income"
      ? "text-[var(--chart-income)]"
      : tone === "spend"
        ? "text-[var(--chart-spend)]"
        : "text-ink";
  return (
    <div className="min-w-0 rounded border border-rule bg-surface-raised px-3 py-2">
      <div className="truncate text-[0.75rem] text-ink-muted">{label}</div>
      <div className={`tabular text-[1.25rem] leading-tight font-medium ${valueClass}`}>
        {value}
      </div>
      {detail && (
        <div className="mt-0.5 text-[0.75rem] leading-snug text-ink-muted">
          {detail}
        </div>
      )}
    </div>
  );
}

/** A responsive row of tiles — one column on a phone, up to four on a desktop. */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/** What a panel shows when there is nothing to draw. Never a blank box. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-rule px-3 py-4 text-center text-[0.8125rem] text-ink-muted">
      {children}
    </p>
  );
}
