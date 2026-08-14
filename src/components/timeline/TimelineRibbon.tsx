"use client";

import { useMemo, useState } from "react";
import {
  axisTicks,
  offsetPercent,
  ribbonRange,
  type Ribbon,
  type RibbonBar,
  type RibbonLane,
  type RibbonPin,
  type RibbonRange,
} from "@/lib/timeline/ribbon";
import { spanDuration } from "@/lib/history/span";
import { ZOOM_PX_PER_YEAR, type TimelineZoom } from "@/lib/settings/timeline";
import { chartCatVar } from "@/components/finances/insights/chartColors";
import { useToday } from "@/components/grid/useToday";
import { useDateFormatter } from "@/components/settings/SettingsProvider";

/**
 * The Timeline drawn as spans: how long each job and each address lasted, and what overlapped.
 *
 * The chronology grid beside it answers "what happened, in order" and splits every span into two
 * point rows on purpose. This is the projection that question left behind, and it is the only
 * place in the app where duration is a *shape* rather than a string.
 *
 * **Not a chart library.** Recharts, which draws every other picture here, has no span mark —
 * faking one out of a stacked bar is a known trick and a bad one. What this needs instead is a
 * layout in one dimension whose marks are focusable, tappable at 44px and able to truncate their
 * own labels, and percentage-positioned `<button>`s get all of that from the platform.
 * `components/responsive.md` sanctions the horizontal scroll it costs: a view that cannot be
 * re-thought narrow "scrolls horizontally inside its own container and says so".
 *
 * **Geometry that could be wrong lives in `lib/timeline/ribbon.ts`**, which is pure and tested —
 * sub-row packing, half-open spans, the range, the tick step. What is left here is drawing.
 */

/** Whatever the reader is pointing at, echoed in the strip below the ribbon. */
type Focused = { kind: "bar"; bar: RibbonBar } | { kind: "pin"; pin: RibbonPin } | null;

const LANE_COLOR_INDEX: Record<RibbonLane["id"], number> = { home: 1, work: 0 };

export function TimelineRibbon({
  ribbon,
  zoom,
  onOpenRecord,
  onSelectEvent,
  empty,
}: {
  ribbon: Ribbon;
  zoom: TimelineZoom;
  /** Open the job or residence a bar was derived from, on the page that owns it. */
  onOpenRecord: (bar: RibbonBar) => void;
  /** An event has no record to open — it edits in the grid, so a pin sends you there. */
  onSelectEvent: (pin: RibbonPin) => void;
  empty: React.ReactNode;
}) {
  const todayKey = useToday();
  const formatDate = useDateFormatter();
  const [focused, setFocused] = useState<Focused>(null);

  const range = useMemo(
    () => ribbonRange(ribbon.bounds, todayKey),
    [ribbon.bounds, todayKey],
  );

  if (!range) return <>{empty}</>;

  const pxPerYear = ZOOM_PX_PER_YEAR[zoom];
  const years = range.endYear - range.startYear + 1;
  const ticks = axisTicks(range, pxPerYear);

  /**
   * Where a bar stops when its end was never recorded. Today if we know it, the axis edge if we
   * do not — the axis ends at the last recorded date before hydration, so the bar still reaches
   * the edge and still reads as ongoing either way.
   */
  const openEnd = todayKey ?? range.endKey;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {/*
        The scroller hugs its content rather than filling the page: three lanes are a few hundred
        pixels tall, and stretching them would push the key to the bottom of an empty screen with
        nothing between the two. It still shrinks — flex items do by default — so a short window
        scrolls the lanes instead of clipping them.
      */}
      <div className="min-h-0 overflow-auto">
        <div
          className="relative min-w-full"
          style={pxPerYear === null ? undefined : { width: `${years * pxPerYear}px` }}
        >
          <Axis range={range} ticks={ticks} />

          <div className="relative">
            <Gridlines range={range} ticks={ticks} todayKey={todayKey} />

            {ribbon.lanes.map((lane) => (
              <Lane key={lane.id} label={lane.label}>
                {lane.rows.map((row, index) => (
                  <div key={index} className="relative h-8 md:h-7">
                    {row.map((bar) => (
                      <Bar
                        key={bar.id}
                        bar={bar}
                        range={range}
                        openEnd={openEnd}
                        colorIndex={LANE_COLOR_INDEX[lane.id]}
                        todayKey={todayKey}
                        formatDate={formatDate}
                        onFocus={() => setFocused({ kind: "bar", bar })}
                        onBlur={() => setFocused(null)}
                        onOpen={() => onOpenRecord(bar)}
                      />
                    ))}
                  </div>
                ))}
              </Lane>
            ))}

            {ribbon.pins.length > 0 && (
              <Lane label="Life">
                <div className="relative h-11">
                  {ribbon.pins.map((pin) => (
                    <Pin
                      key={pin.id}
                      pin={pin}
                      range={range}
                      formatDate={formatDate}
                      onFocus={() => setFocused({ kind: "pin", pin })}
                      onBlur={() => setFocused(null)}
                      onOpen={() => onSelectEvent(pin)}
                    />
                  ))}
                </div>
              </Lane>
            )}
          </div>
        </div>
      </div>

      <Footer
        focused={focused}
        categories={ribbon.categories}
        todayKey={todayKey}
        formatDate={formatDate}
      />
    </div>
  );
}

/**
 * The year scale, pinned to the top of the scroller.
 *
 * Labels sit *after* their tick rather than centred on it, because a year label centred on
 * January 1st claims half of the year before it.
 */
function Axis({
  range,
  ticks,
}: {
  range: RibbonRange;
  ticks: ReturnType<typeof axisTicks>;
}) {
  return (
    <div className="sticky top-0 z-20 h-6 border-b border-rule bg-surface">
      {ticks.map((tick) => (
        <span
          key={tick.year}
          className="absolute top-0 pl-1 text-[0.6875rem] leading-6 text-ink-faint"
          style={{ left: `${offsetPercent(range, tick.dateKey)}%` }}
        >
          {tick.year}
        </span>
      ))}
    </div>
  );
}

/** Year rules behind the bars, and the one that says where now is. */
function Gridlines({
  range,
  ticks,
  todayKey,
}: {
  range: RibbonRange;
  ticks: ReturnType<typeof axisTicks>;
  todayKey: string | null;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <span
          key={tick.year}
          className="absolute inset-y-0 w-px bg-rule"
          style={{ left: `${offsetPercent(range, tick.dateKey)}%` }}
        />
      ))}
      {todayKey && todayKey >= range.startKey && todayKey <= range.endKey && (
        <span
          className="absolute inset-y-0 w-px bg-[var(--select-edge)]"
          style={{ left: `${offsetPercent(range, todayKey)}%` }}
        />
      )}
    </div>
  );
}

/**
 * One lane and its name.
 *
 * The name is `sticky left-0` so it stays readable when the ribbon is panned — at `Years` zoom a
 * whole life is many screens wide, and a lane you have scrolled into the middle of is otherwise
 * unlabelled.
 */
function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule py-1 last:border-b-0">
      <h3 className="sticky left-0 z-10 w-fit px-2 text-[0.6875rem] tracking-wide text-ink-faint uppercase">
        {label}
      </h3>
      {children}
    </section>
  );
}

/**
 * One span.
 *
 * A boundary that was never recorded is drawn dashed and square; a recorded one is solid and
 * rounded. The distinction is the whole reason the bar keeps `null` ends rather than filling them
 * in — "still there" and "we do not know" must not look like a date.
 */
function Bar({
  bar,
  range,
  openEnd,
  colorIndex,
  todayKey,
  formatDate,
  onFocus,
  onBlur,
  onOpen,
}: {
  bar: RibbonBar;
  range: RibbonRange;
  openEnd: string;
  colorIndex: number;
  todayKey: string | null;
  formatDate: (key: string | null | undefined) => string;
  onFocus: () => void;
  onBlur: () => void;
  onOpen: () => void;
}) {
  const start = bar.startKey ?? range.startKey;
  const end = bar.endKey ?? openEnd;
  const left = offsetPercent(range, start);
  const right = offsetPercent(range, end);
  const color = chartCatVar(colorIndex);

  return (
    <button
      type="button"
      title={barTitle(bar, todayKey, formatDate)}
      onMouseEnter={onFocus}
      onMouseLeave={onBlur}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onOpen}
      className="absolute inset-y-0.5 overflow-hidden border px-1.5 text-left text-[0.75rem] leading-none whitespace-nowrap text-ink transition-[filter] hover:brightness-105 focus:outline-2 focus:outline-offset-1 focus:outline-[var(--select-edge)]"
      style={{
        left: `${left}%`,
        width: `${Math.max(right - left, 0)}%`,
        minWidth: "0.5rem",
        background: `color-mix(in srgb, ${color} 28%, var(--surface))`,
        borderColor: color,
        borderLeftStyle: bar.startKey ? "solid" : "dashed",
        borderRightStyle: bar.endKey ? "solid" : "dashed",
        borderTopLeftRadius: bar.startKey ? "0.25rem" : 0,
        borderBottomLeftRadius: bar.startKey ? "0.25rem" : 0,
        borderTopRightRadius: bar.endKey ? "0.25rem" : 0,
        borderBottomRightRadius: bar.endKey ? "0.25rem" : 0,
      }}
    >
      {bar.label}
    </button>
  );
}

/**
 * One life event.
 *
 * The dot is 8px and the button around it is a full tap target — `components/responsive.md`,
 * "where a compact layout needs the same action, it gets a new control at tap size". Above `md`
 * the hit area narrows again so that two events a month apart do not shadow each other.
 */
function Pin({
  pin,
  range,
  formatDate,
  onFocus,
  onBlur,
  onOpen,
}: {
  pin: RibbonPin;
  range: RibbonRange;
  formatDate: (key: string | null | undefined) => string;
  onFocus: () => void;
  onBlur: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      title={`${pin.title || "Untitled event"} — ${formatDate(pin.dateKey)}`}
      onMouseEnter={onFocus}
      onMouseLeave={onBlur}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onOpen}
      className="absolute inset-y-0 flex w-11 -translate-x-1/2 items-center justify-center focus:outline-2 focus:outline-offset-1 focus:outline-[var(--select-edge)] md:w-5"
      style={{ left: `${offsetPercent(range, pin.dateKey)}%` }}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-full border border-surface"
        style={{ background: chartCatVar(pin.colorIndex) }}
      />
      <span className="sr-only">
        {pin.title || "Untitled event"} — {formatDate(pin.dateKey)}
      </span>
    </button>
  );
}

/**
 * What you are pointing at, and what the colours mean.
 *
 * A strip rather than a floating popover: there is no hover on touch, and a tooltip that has to
 * be positioned near the pointer is exactly the control a finger cannot summon. It keeps a fixed
 * height so the ribbon above it does not resize as the reader moves across it.
 */
function Footer({
  focused,
  categories,
  todayKey,
  formatDate,
}: {
  focused: Focused;
  categories: Ribbon["categories"];
  todayKey: string | null;
  formatDate: (key: string | null | undefined) => string;
}) {
  return (
    <div className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule px-3 py-2">
      <p className="min-h-5 min-w-0 text-[0.8125rem] text-ink">
        {focused === null ? (
          <span className="text-ink-faint">
            Point at a bar or a dot for its dates. Click to open the record.
          </span>
        ) : focused.kind === "bar" ? (
          <>
            <span className="font-medium">{focused.bar.label}</span>{" "}
            <span className="text-ink-muted">
              {barSpan(focused.bar, todayKey, formatDate)}
            </span>
            {focused.bar.detail && (
              <span className="text-ink-faint"> · {focused.bar.detail}</span>
            )}
          </>
        ) : (
          <>
            <span className="font-medium">{focused.pin.title || "Untitled event"}</span>{" "}
            <span className="text-ink-muted">{formatDate(focused.pin.dateKey)}</span>
            {focused.pin.category && (
              <span className="text-ink-faint"> · {focused.pin.category}</span>
            )}
          </>
        )}
      </p>

      {categories.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-ink-muted">
          {categories.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: chartCatVar(entry.colorIndex) }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * `"Mar 1, 2019 – Jun 30, 2022 · 3y 3m 29d"`.
 *
 * An unrecorded boundary is `?` rather than blank, and an unrecorded *end* on a span that has
 * started is `now` — the two look the same on the axis and must not read the same in words.
 * Duration is missing rather than zero until hydration supplies today.
 */
function barSpan(
  bar: RibbonBar,
  todayKey: string | null,
  formatDate: (key: string | null | undefined) => string,
): string {
  const duration = spanDuration({ start: bar.startKey, end: bar.endKey }, todayKey);
  const from = bar.startKey ? formatDate(bar.startKey) : "?";
  const to = bar.endKey ? formatDate(bar.endKey) : duration.ongoing ? "now" : "?";
  return duration.text ? `${from} – ${to} · ${duration.text}` : `${from} – ${to}`;
}

/** The bar's accessible name and tooltip. */
function barTitle(
  bar: RibbonBar,
  todayKey: string | null,
  formatDate: (key: string | null | undefined) => string,
): string {
  return `${bar.label} — ${barSpan(bar, todayKey, formatDate)}`;
}
