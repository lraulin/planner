"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  axisTicks,
  barInRange,
  clampWindow,
  keyAtFraction,
  offsetPercent,
  packLane,
  pinLabelWidths,
  ribbonRange,
  type Ribbon,
  type RibbonBar,
  type RibbonPin,
  type RibbonRange,
  type RibbonTick,
} from "@/lib/timeline/ribbon";
import { spanDuration } from "@/lib/history/span";
import type { TimelineWindow } from "@/lib/settings/timeline";
import { AXIS_LOCK_PX, swipeAxis } from "@/lib/touch/swipe";
import { chartCatVar } from "@/components/finances/insights/chartColors";
import { useToday } from "@/components/grid/useToday";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { useElementWidth } from "./useElementWidth";

/**
 * The Timeline drawn as spans: how long each job and each address lasted, and what overlapped.
 *
 * The chronology grid beside it answers "what happened, in order" and splits every span into two
 * point rows on purpose. This is the projection that question left behind, and it is the only
 * place in the app where duration is a *shape* rather than a string.
 *
 * **The range is the zoom.** Drag across the ribbon to look at that stretch; the drawing always
 * fills the container, so there is no horizontal scrolling and a phone sees the same thing a
 * desktop does. This replaced a `Fit | Decades | Years` control that scaled the axis and then made
 * you pan sideways to reach a year — the long way round to "show me 2015".
 *
 * **Not a chart library.** Recharts, which draws every other picture here, has no span mark —
 * faking one out of a stacked bar is a known trick and a bad one. What this needs instead is a
 * layout in one dimension whose marks are focusable, tappable at 44px and able to truncate their
 * own labels, and percentage-positioned `<button>`s get all of that from the platform.
 *
 * **Geometry that could be wrong lives in `lib/timeline/ribbon.ts`**, which is pure and tested —
 * sub-row packing, half-open spans, the range, the tick step, how much room a pin label has. What
 * is left here is drawing and one gesture.
 */

/** Whatever the reader is pointing at, echoed in the strip below the ribbon. */
type Focused = { kind: "bar"; bar: RibbonBar } | { kind: "pin"; pin: RibbonPin } | null;

/** A drag in progress, as two fractions of the container's width. */
type Selection = { from: number; to: number };

const LANE_COLOR_INDEX = { home: 1, work: 0 } as const;

export function TimelineRibbon({
  ribbon,
  window: chosenWindow,
  onWindowChange,
  onOpenRecord,
  onSelectEvent,
  empty,
}: {
  ribbon: Ribbon;
  /** The stretch being drawn, or null for the whole life. */
  window: TimelineWindow | null;
  onWindowChange: (next: TimelineWindow | null) => void;
  /** Open the job or residence a bar was derived from, on the page that owns it. */
  onOpenRecord: (bar: RibbonBar) => void;
  /** An event has no record to open — it edits in the grid, so a pin sends you there. */
  onSelectEvent: (pin: RibbonPin) => void;
  empty: React.ReactNode;
}) {
  const todayKey = useToday();
  const formatDate = useDateFormatter();
  const { ref: plotRef, width } = useElementWidth<HTMLDivElement>();
  const [focused, setFocused] = useState<Focused>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const range = useMemo(
    () => ribbonRange(ribbon.bounds, todayKey, chosenWindow),
    [ribbon.bounds, todayKey, chosenWindow],
  );

  const drag = useRangeDrag({ range, onWindowChange, selection, setSelection });

  const lanes = useMemo(
    () =>
      range
        ? ribbon.lanes.map((lane) => ({
            ...lane,
            // Packed here rather than in the derivation because which bars are on screen depends
            // on the window: packing the whole life and then filtering leaves empty sub-rows.
            rows: packLane(lane.bars.filter((bar) => barInRange(bar, range))),
          }))
        : [],
    [ribbon.lanes, range],
  );

  const pins = useMemo(
    () =>
      range
        ? ribbon.pins.filter(
            (pin) => pin.dateKey >= range.startKey && pin.dateKey <= range.endKey,
          )
        : [],
    [ribbon.pins, range],
  );

  const labelWidths = useMemo(
    () => (range ? pinLabelWidths(pins, range, width) : []),
    [pins, range, width],
  );

  if (!range) return <>{empty}</>;

  const ticks = axisTicks(range, width);
  // Where a bar stops when its end was never recorded: today if we know it, the axis edge if not.
  const openEnd = todayKey ?? range.endKey;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {/*
        The scroller hugs its content rather than filling the page: three lanes are a few hundred
        pixels tall, and stretching them would push the key to the bottom of an empty screen with
        nothing between the two. It still shrinks — flex items do by default — so a short window
        scrolls the lanes instead of clipping them.
      */}
      <div className="min-h-0 overflow-y-auto">
        {/*
          `touch-action: pan-y` is the whole reason a drag here does not fight the page: the
          browser keeps vertical scrolling for itself and hands us the horizontal gesture, rather
          than us guessing from coordinates and getting it wrong on a crooked swipe.
        */}
        <div
          ref={plotRef}
          className="relative touch-pan-y select-none"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onClickCapture={drag.onClickCapture}
          onDoubleClick={drag.onDoubleClick}
        >
          <Axis range={range} ticks={ticks} />

          <div className="relative">
            <Gridlines range={range} ticks={ticks} todayKey={todayKey} />

            {lanes.map((lane) => (
              <Lane key={lane.id} label={lane.label}>
                {lane.rows.length === 0 ? (
                  <div className="h-8 md:h-7" />
                ) : (
                  lane.rows.map((row, index) => (
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
                  ))
                )}
              </Lane>
            ))}

            {pins.length > 0 && (
              <Lane label="Life">
                <div className="relative h-11">
                  {pins.map((pin, index) => (
                    <Pin
                      key={pin.id}
                      pin={pin}
                      range={range}
                      labelWidth={labelWidths[index]}
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

          {selection && <SelectionBand selection={selection} />}
        </div>
      </div>

      <Footer
        focused={focused}
        selection={selection}
        range={range}
        categories={ribbon.categories}
        todayKey={todayKey}
        formatDate={formatDate}
      />
    </div>
  );
}

/**
 * Drag across the ribbon to look at that stretch; double-click to go back to the whole life.
 *
 * Three things have to be true at once and none of them is free:
 *
 * - **A drag must not steal a scroll.** `touch-action: pan-y` on the surface plus the shared
 *   `swipeAxis` lock (`lib/touch/swipe.ts`, already the arbiter for row swipes) means a gesture
 *   only becomes a selection once it has clearly committed to the horizontal.
 * - **A drag must not also be a click.** The bars and pins under the pointer are real buttons, so
 *   a selection that started on one would otherwise open a record on release. The capture-phase
 *   click handler eats exactly the one click that follows a drag.
 * - **A tap must stay a tap.** Below the lock distance nothing is selected and the click runs
 *   normally, which is what keeps a bar clickable at all.
 */
function useRangeDrag({
  range,
  onWindowChange,
  selection,
  setSelection,
}: {
  range: RibbonRange | null;
  onWindowChange: (next: TimelineWindow | null) => void;
  selection: Selection | null;
  setSelection: (next: Selection | null) => void;
}) {
  const start = useRef<{ x: number; y: number; width: number; left: number } | null>(
    null,
  );
  const committed = useRef(false);
  const justDragged = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    start.current = {
      x: event.clientX,
      y: event.clientY,
      width: box.width,
      left: box.left,
    };
    committed.current = false;
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = start.current;
      if (!origin || origin.width === 0) return;

      if (!committed.current) {
        const axis = swipeAxis(
          event.clientX - origin.x,
          event.clientY - origin.y,
          AXIS_LOCK_PX,
        );
        if (axis !== "horizontal") return;
        committed.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      setSelection({
        from: (origin.x - origin.left) / origin.width,
        to: (event.clientX - origin.left) / origin.width,
      });
    },
    [setSelection],
  );

  const finish = useCallback(() => {
    const current = selection;
    start.current = null;
    committed.current = false;
    setSelection(null);

    if (!current || !range) return;
    justDragged.current = true;
    onWindowChange(
      clampWindow(keyAtFraction(range, current.from), keyAtFraction(range, current.to)),
    );
  }, [selection, range, onWindowChange, setSelection]);

  const onPointerCancel = useCallback(() => {
    start.current = null;
    committed.current = false;
    setSelection(null);
  }, [setSelection]);

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!justDragged.current) return;
    justDragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  /** Back to the whole life. Not on a bar or a pin, where a double-click means the record. */
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).closest("button")) return;
      onWindowChange(null);
    },
    [onWindowChange],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel,
    onClickCapture,
    onDoubleClick,
  };
}

function SelectionBand({ selection }: { selection: Selection }) {
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 border-x border-[var(--select-edge)] bg-[var(--select)] opacity-40"
      style={{
        left: `${Math.max(0, from) * 100}%`,
        width: `${(Math.min(1, to) - Math.max(0, from)) * 100}%`,
      }}
    />
  );
}

/**
 * The scale, pinned to the top of the scroller.
 *
 * Labels sit *after* their mark rather than centred on it, because a label centred on January 1st
 * claims half of the year before it.
 */
function Axis({ range, ticks }: { range: RibbonRange; ticks: RibbonTick[] }) {
  return (
    <div className="sticky top-0 z-20 h-6 border-b border-rule bg-surface">
      {ticks.map((tick) => (
        <span
          key={tick.dateKey}
          className={`absolute top-0 pl-1 text-[0.6875rem] leading-6 whitespace-nowrap ${
            tick.major ? "text-ink-muted" : "text-ink-faint"
          }`}
          style={{ left: `${offsetPercent(range, tick.dateKey)}%` }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  );
}

/** Scale rules behind the bars, and the one that says where now is. */
function Gridlines({
  range,
  ticks,
  todayKey,
}: {
  range: RibbonRange;
  ticks: RibbonTick[];
  todayKey: string | null;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <span
          key={tick.dateKey}
          className={`absolute inset-y-0 w-px ${tick.major ? "bg-rule-strong" : "bg-rule"}`}
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

/** One lane and its name. */
function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule py-1 last:border-b-0">
      <h3 className="w-fit px-2 text-[0.6875rem] tracking-wide text-ink-faint uppercase">
        {label}
      </h3>
      {children}
    </section>
  );
}

/**
 * One span.
 *
 * Three kinds of edge, and they must not be confusable:
 *
 * | Edge                            | Drawn                  |
 * | ------------------------------- | ---------------------- |
 * | A recorded date                 | solid, rounded         |
 * | Never recorded                  | dashed, square         |
 * | Runs past the window on screen  | no border, square      |
 *
 * The third is why this takes the range at all. "Still there", "we don't know" and "carry on past
 * the edge you chose" are three different claims, and a bar that says the wrong one is a bar that
 * lies about a date.
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

  const clippedStart = start < range.startKey;
  const clippedEnd = end > range.endKey;

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
        ...edgeStyle("Left", bar.startKey !== null, clippedStart),
        ...edgeStyle("Right", bar.endKey !== null, clippedEnd),
      }}
    >
      {bar.label}
    </button>
  );
}

function edgeStyle(side: "Left" | "Right", recorded: boolean, clipped: boolean) {
  const radius =
    side === "Left" ? ["TopLeft", "BottomLeft"] : ["TopRight", "BottomRight"];
  const rounded = recorded && !clipped ? "0.25rem" : 0;
  return {
    [`border${side}Style`]: clipped ? "none" : recorded ? "solid" : "dashed",
    [`border${radius[0]}Radius`]: rounded,
    [`border${radius[1]}Radius`]: rounded,
  } as React.CSSProperties;
}

/**
 * One life event: a dot, and its title when there is room before the next one.
 *
 * The label's width is whatever `pinLabelWidths` measured as free, and the text truncates into it
 * — so nothing here has to estimate how wide a string renders. Below the useful minimum the label
 * is absent rather than an ellipsis with a letter in front of it, and the tooltip and the detail
 * strip still carry the whole title.
 *
 * The dot is 8px and the button around it is a full tap target — `components/responsive.md`,
 * "where a compact layout needs the same action, it gets a new control at tap size". Above `md`
 * the hit area narrows so two events a month apart do not shadow each other.
 */
function Pin({
  pin,
  range,
  labelWidth,
  formatDate,
  onFocus,
  onBlur,
  onOpen,
}: {
  pin: RibbonPin;
  range: RibbonRange;
  labelWidth: number | null;
  formatDate: (key: string | null | undefined) => string;
  onFocus: () => void;
  onBlur: () => void;
  onOpen: () => void;
}) {
  const title = pin.title || "Untitled event";
  const left = `${offsetPercent(range, pin.dateKey)}%`;

  /*
   * Two elements rather than one, because the dot and the label want different anchors: the dot is
   * *centred* on the date, and the label *starts* at it and runs right. Nesting the label inside
   * the tap target would offset it by half the target's width, and a label centred on the date
   * instead would overhang to the left — off the ribbon entirely on the first pin, and into the
   * previous label everywhere else, which is the collision `pinLabelWidths` measured to avoid.
   */
  return (
    <>
      <button
        type="button"
        title={`${title} — ${formatDate(pin.dateKey)}`}
        onMouseEnter={onFocus}
        onMouseLeave={onBlur}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onOpen}
        className="absolute inset-y-0 flex w-11 -translate-x-1/2 items-start justify-center pt-1.5 focus:outline-2 focus:outline-offset-1 focus:outline-[var(--select-edge)] md:w-5"
        style={{ left }}
      >
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full border border-surface"
          style={{ background: chartCatVar(pin.colorIndex) }}
        />
        <span className="sr-only">
          {title} — {formatDate(pin.dateKey)}
        </span>
      </button>

      {labelWidth !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 overflow-hidden pl-1 text-[0.6875rem] leading-tight text-ellipsis whitespace-nowrap text-ink-muted"
          style={{ left, maxWidth: `${labelWidth}px` }}
        >
          {title}
        </span>
      )}
    </>
  );
}

/**
 * What you are pointing at, and what the colours mean.
 *
 * A strip rather than a floating popover: there is no hover on touch, and a tooltip that has to be
 * positioned near the pointer is exactly the control a finger cannot summon. It keeps a fixed
 * height so the ribbon above it does not resize as the reader moves across it, and during a drag
 * it reports the stretch about to be selected — otherwise the gesture is a guess until it lands.
 */
function Footer({
  focused,
  selection,
  range,
  categories,
  todayKey,
  formatDate,
}: {
  focused: Focused;
  selection: Selection | null;
  range: RibbonRange;
  categories: Ribbon["categories"];
  todayKey: string | null;
  formatDate: (key: string | null | undefined) => string;
}) {
  return (
    <div className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule px-3 py-2">
      <p className="min-h-5 min-w-0 text-[0.8125rem] text-ink">
        {selection ? (
          <>
            <span className="font-medium">Show</span>{" "}
            <span className="text-ink-muted">
              {formatDate(keyAtFraction(range, Math.min(selection.from, selection.to)))}{" "}
              –{" "}
              {formatDate(keyAtFraction(range, Math.max(selection.from, selection.to)))}
            </span>
          </>
        ) : focused === null ? (
          <span className="text-ink-faint">
            Drag across to look at a stretch, double-click for all of it. Click a bar to
            open the record.
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
