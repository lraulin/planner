"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IDLE,
  LONG_PRESS_MS,
  didFire,
  pressDown,
  pressMove,
  pressTick,
  pressUp,
  type PressState,
} from "@/lib/touch/longPress";
import { swipeAction, swipeAxis, swipeOffset, type SwipeAxis } from "@/lib/touch/swipe";
import type { CompactFields } from "@/lib/grid/compactFields";
import type { ColumnDef, NodeGridRow } from "./columns";

/**
 * Opt-in row swipe, in the shape of `RowDrag`: the grid owns the gesture, the host owns the
 * meaning. Only reversible actions belong here (`responsive.md`) — nothing that deletes
 * without a way back.
 */
export type RowSwipeAction = { label: string; run: () => void };

export type RowSwipe = {
  /** Swiping the row leftwards. */
  left?: RowSwipeAction;
  /** Swiping the row rightwards. */
  right?: RowSwipeAction;
};

/**
 * One row of a grid, on a phone.
 *
 * Two lines instead of thirteen columns: the primary column's own cell on top — which keeps
 * the type icon and the indent rails, so hierarchy survives — and a meta line of read-only
 * chips beneath. Priority becomes a colour bar down the left edge, where it reads as fast as
 * the desktop Pri column did without spending 48px on it.
 *
 * Tap opens the record and long press opens the row menu, translating the desktop double-click
 * and right-click (`responsive.md`). Long press is not decoration: on the Day and Notes grids
 * that menu carries commands that exist nowhere else in the app.
 */
export function CompactRow<TCtx, TRow>({
  row,
  columnCtx,
  fields,
  selected,
  onSelect,
  onOpenDetail,
  onLongPress,
  swipe,
  label,
  expanded,
}: {
  row: NodeGridRow<TRow>;
  columnCtx: TCtx;
  fields: CompactFields<ColumnDef<TCtx, TRow>>;
  selected: boolean;
  onSelect: () => void;
  onOpenDetail?: () => void;
  onLongPress?: (x: number, y: number) => void;
  swipe?: RowSwipe;
  label?: string;
  expanded?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const press = useRef<PressState>(IDLE);
  const timer = useRef<number | null>(null);
  // A long press must swallow the click that follows it, or the menu opens and the record
  // opens behind it. A completed swipe does the same.
  const consumedTap = useRef(false);

  const origin = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<SwipeAxis>("none");
  const [offset, setOffset] = useState(0);

  const endSwipe = useCallback(() => {
    origin.current = null;
    axis.current = "none";
    setOffset(0);
  }, []);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const accentText = textOf(fields.accent, row, columnCtx);
  const chips = [
    accentText,
    ...fields.meta.map((column) => textOf(column, row, columnCtx)),
  ].filter((text): text is string => Boolean(text));

  return (
    <div className="relative overflow-hidden">
      <SwipeTrack offset={offset} swipe={swipe} />

      <div
        ref={rowRef}
        role="row"
        // Tells the grid's blank-area handler that this press was over a record. See `DataGrid`.
        data-node-row=""
        aria-level={row.depth + 1}
        aria-selected={selected}
        aria-expanded={expanded}
        aria-label={label}
        onPointerDown={(event) => {
          consumedTap.current = false;
          if (swipe) origin.current = { x: event.clientX, y: event.clientY };
          if (!onLongPress) return;
          press.current = pressDown(event.clientX, event.clientY, performance.now());
          const { clientX, clientY } = event;
          clearTimer();
          timer.current = window.setTimeout(() => {
            press.current = pressTick(press.current, performance.now());
            if (didFire(press.current)) {
              consumedTap.current = true;
              endSwipe();
              onLongPress(clientX, clientY);
            }
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(event) => {
          // The press cancels at 10px and the swipe locks its axis at 12px, so a gesture that
          // becomes a swipe has already stopped being a candidate long press.
          press.current = pressMove(press.current, event.clientX, event.clientY);
          if (press.current.phase === "cancelled") clearTimer();

          if (!swipe || !origin.current) return;
          const dx = event.clientX - origin.current.x;
          const dy = event.clientY - origin.current.y;
          if (axis.current === "none") axis.current = swipeAxis(dx, dy);
          if (axis.current === "vertical") {
            // The list won this gesture. Let go of it entirely rather than fighting the scroll.
            origin.current = null;
            return;
          }
          setOffset(swipeOffset(dx, axis.current));
        }}
        onPointerUp={(event) => {
          clearTimer();
          press.current = pressUp();

          if (!swipe || !origin.current) return endSwipe();
          const dx = event.clientX - origin.current.x;
          const action = swipeAction(dx, axis.current);
          const handler =
            action === "left" ? swipe.left : action === "right" ? swipe.right : null;
          endSwipe();
          if (handler) {
            consumedTap.current = true;
            handler.run();
          }
        }}
        onPointerCancel={() => {
          clearTimer();
          press.current = pressUp();
          endSwipe();
        }}
        // `pan-y` hands vertical scrolling to the browser and leaves the horizontal axis to
        // us. Without it a horizontal drag can be swallowed before any pointermove arrives.
        style={
          swipe
            ? { touchAction: "pan-y", transform: `translateX(${offset}px)` }
            : undefined
        }
        onClick={(event) => {
          if (consumedTap.current) {
            consumedTap.current = false;
            return;
          }
          // Inline controls inside a cell (an expander, a checkbox) handle their own tap.
          if ((event.target as HTMLElement).closest("input, select, button")) {
            onSelect();
            return;
          }
          onSelect();
          onOpenDetail?.();
        }}
        className={[
          "relative flex min-h-tap w-full items-center gap-2.5 border-b border-rule/60 py-2 pr-3 pl-2.5 text-left",
          // Opaque so the swipe track behind it stays hidden until the row actually moves.
          selected ? "bg-select" : "bg-surface",
        ].join(" ")}
      >
        <AccentBar text={accentText} />

        {/* The one column rendered as a live control rather than text — a Day item's check
          box. Sized here rather than in the cell, so the desktop grid keeps its 14px one. */}
        {fields.leading && (
          <span className="flex h-tap w-8 flex-none items-center justify-center [&_input]:h-5 [&_input]:w-5">
            {fields.leading.render(row, columnCtx)}
          </span>
        )}

        {/*
         * Indent the whole card rather than the name cell, and hand the primary column a row at
         * depth 0 so it draws no spines. Left to itself the name cell indents only the title,
         * and the meta line beneath it starts back at the card edge — the two lines of one row
         * visibly disagreeing about where the row begins.
         */}
        <div
          className="flex min-w-0 flex-1 flex-col gap-0.5"
          style={
            row.depth > 0
              ? { marginLeft: `calc(${row.depth} * var(--indent-step))` }
              : undefined
          }
        >
          <div className="flex min-w-0 items-center text-[0.9375rem] leading-snug">
            {fields.primary?.render({ ...row, depth: 0 }, columnCtx)}
          </div>
          {chips.length > 0 && (
            <div
              className="truncate text-[0.75rem] text-ink-muted"
              // The name cell puts an expander and a type icon before its text, so a meta line
              // flush with the card would sit visibly left of the title it belongs to. Other
              // primary columns have no such gutter. `name` is already special-cased this way
              // in `DataGrid`'s `nameColumnLeft`.
              style={
                fields.primary?.id === "name"
                  ? { paddingLeft: "var(--name-gutter)" }
                  : undefined
              }
            >
              {chips.join(" · ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * What the swipe is about to do, revealed as the row slides off it.
 *
 * Both labels are rendered and the offset picks which edge is visible, so the answer to
 * "what happens if I let go" is on screen the whole time the finger is down.
 */
function SwipeTrack({ offset, swipe }: { offset: number; swipe?: RowSwipe }) {
  if (!swipe || offset === 0) return null;

  const action = offset < 0 ? swipe.left : swipe.right;
  if (!action) return null;

  return (
    <div
      aria-hidden
      // `px-3` and 12px type so a one-word label fits inside the trigger distance — at `px-4`
      // and 13px, "Tomorrow" was still clipped at the point where releasing would fire it.
      className={`absolute inset-0 flex items-center bg-select-edge/15 px-3 text-[0.75rem] font-medium whitespace-nowrap text-ink ${
        offset < 0 ? "justify-end" : "justify-start"
      }`}
    >
      {action.label}
    </div>
  );
}

function textOf<TCtx, TRow>(
  column: ColumnDef<TCtx, TRow> | null,
  row: NodeGridRow<TRow>,
  _ctx: TCtx,
): string | null {
  if (!column) return null;
  const text = column.compactText
    ? column.compactText(row)
    : (column.filterValue?.(row) ?? null);
  return text && text.trim() !== "" ? text : null;
}

/**
 * Priority as a bar rather than a column. The letter is what carries the hue — the rank
 * ("A1" versus "A3") is in the meta line, where the difference is legible.
 *
 * A row with no priority still gets the bar's width, so titles line up down the list.
 */
function AccentBar({ text }: { text: string | null }) {
  const letter = text?.[0]?.toUpperCase();
  const colour =
    letter === "A"
      ? "bg-priority-a"
      : letter === "B"
        ? "bg-priority-b"
        : letter === "C"
          ? "bg-priority-c"
          : letter === "D"
            ? "bg-priority-d"
            : "bg-transparent";

  return (
    <span aria-hidden className={`h-8 w-[3px] flex-none rounded-full ${colour}`} />
  );
}
