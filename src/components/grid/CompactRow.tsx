"use client";

import { useCallback, useEffect, useRef } from "react";
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
import type { CompactFields } from "@/lib/grid/compactFields";
import type { ColumnDef, NodeGridRow } from "./columns";

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
  label?: string;
  expanded?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const press = useRef<PressState>(IDLE);
  const timer = useRef<number | null>(null);
  // A long press must swallow the click that follows it, or the menu opens and the record
  // opens behind it.
  const consumedTap = useRef(false);

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
    <div
      ref={rowRef}
      role="row"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={expanded}
      aria-label={label}
      onPointerDown={
        onLongPress &&
        ((event) => {
          consumedTap.current = false;
          press.current = pressDown(event.clientX, event.clientY, performance.now());
          const { clientX, clientY } = event;
          clearTimer();
          timer.current = window.setTimeout(() => {
            press.current = pressTick(press.current, performance.now());
            if (didFire(press.current)) {
              consumedTap.current = true;
              onLongPress(clientX, clientY);
            }
          }, LONG_PRESS_MS);
        })
      }
      onPointerMove={
        onLongPress &&
        ((event) => {
          press.current = pressMove(press.current, event.clientX, event.clientY);
          if (press.current.phase === "cancelled") clearTimer();
        })
      }
      onPointerUp={
        onLongPress &&
        (() => {
          clearTimer();
          press.current = pressUp();
        })
      }
      onPointerCancel={
        onLongPress &&
        (() => {
          clearTimer();
          press.current = pressUp();
        })
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
        selected ? "bg-select" : "",
      ].join(" ")}
    >
      <AccentBar text={accentText} />

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
