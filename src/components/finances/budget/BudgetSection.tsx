"use client";

import type { ReactNode } from "react";

import { formatUsd } from "@/lib/finances/money";

/**
 * A table, its heading and its own subtotal, as one card.
 *
 * The subtotal sits above the grid rather than in a footer under it so the tables read the
 * same way when one of them is empty, and so the page keeps exactly one full-width footer —
 * the combined one, which is the figure that has to be believed
 * (`agent-os/specs/2026-08-26-2159-grid-aggregation-placement/` D4).
 *
 * The card is what makes that placement legible. These sections used to be a flat `gap-3`
 * stack, so a header sat the same distance from its own grid as from the grid above it and
 * pointed at neither; its full-width bottom rule then read as a divider between two tables
 * rather than a cap on one. Containment fixes that without moving a single figure.
 *
 * The grid runs to the card's left and right edges on purpose: `GroupHeader` drops its left
 * padding so group totals stay in their column tracks and rows carry their own `pr-3`, so
 * padding the card body would inset the grid against tuning that already exists.
 *
 * Do not add `overflow-hidden` here. It would make the card a scroll container and break the
 * column header's `sticky top-0`, which sticks to the page scroller.
 *
 * Last-interacted: the ring is what makes `focusedTable` (Assign + File ▸ Export) visible, and
 * it now rings the whole card so the heading it belongs to is inside it. `onFocusCapture` so
 * clicking the header or empty area counts, not only a row.
 */
export function BudgetSection({
  title,
  caption,
  totals,
  level = "h3",
  focused,
  onFocus,
  newItems,
  composer,
  children,
}: {
  title: string;
  caption: string;
  totals: { assignedCents: number; activityCents: number; balanceCents: number };
  /** `h2` for a top-level section — Savings is a peer of Spending, not of Bills. */
  level?: "h2" | "h3";
  focused: boolean;
  onFocus: () => void;
  /** `+ Envelope` / `+ Bill` / `+ Group` — the create gestures for this section's root. */
  newItems?: readonly { label: string; onSelect: () => void }[];
  /** The open composer strip, rendered under the grid rather than inside it (D4). */
  composer?: ReactNode;
  children: ReactNode;
}) {
  const Heading = level;
  return (
    <section
      aria-label={title}
      onFocusCapture={onFocus}
      /* `shrink-0`: a flex item allowed to shrink below its content collapses the grid to one row. */
      className={`flex min-w-0 shrink-0 flex-col rounded border bg-surface ${
        focused
          ? "border-select-edge ring-1 ring-select-edge ring-inset"
          : "border-rule"
      }`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-3 py-2">
        <div className="min-w-0">
          <Heading
            className={
              level === "h2"
                ? "text-[1rem] font-semibold text-ink"
                : "text-[0.9375rem] font-medium text-ink"
            }
          >
            {title}
          </Heading>
          <p className="text-[0.75rem] text-ink-muted">{caption}</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="tabular flex flex-wrap gap-x-4 text-[0.75rem] text-ink-muted">
            <span>{formatUsd(totals.assignedCents)} assigned</span>
            <span>{formatUsd(totals.activityCents)} spent</span>
            <span>{formatUsd(totals.balanceCents)} left</span>
          </span>
          {/* Real buttons, not a hover affordance: every gesture needs a tappable path
              below `md` (`components/responsive.md`). */}
          {newItems && newItems.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {newItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onSelect}
                  className="rounded border border-rule px-2 py-0.5 text-[0.75rem] text-ink hover:bg-surface-raised"
                >
                  + {item.label}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      </header>
      {children}
      {composer}
    </section>
  );
}
