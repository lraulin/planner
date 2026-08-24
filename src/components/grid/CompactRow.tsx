"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
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
import {
  swipeAction,
  swipeAxis,
  swipeOffset,
  swipeProgress,
  type SwipeAxis,
} from "@/lib/touch/swipe";
import { haptic } from "@/lib/touch/haptics";
import { CommandGlyph } from "@/components/icons/commandIcons";
import type { CommandIcon } from "@/lib/commands/icons";
import type { CompactFields } from "@/lib/grid/compactFields";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { formatFullDateKey } from "@/lib/dateFormat";
import type { ColumnDef, NodeGridRow } from "./columns";
import { RowSelectedContext } from "./rowSelectedContext";

/**
 * Opt-in row swipe, in the shape of `RowDrag`: the grid owns the gesture, the host owns the
 * meaning.
 *
 * A direction either does something reversible, or it opens the same confirmation the row
 * menu would (`responsive.md`). Nothing here fires an irreversible mutation on release.
 */
export type RowSwipeAction = {
  label: string;
  /**
   * What the rail looks like. `positive` is the affirmative half — complete, done — and
   * `danger` is the half you have to mean, which in this app is always followed by a
   * confirmation.
   */
  tone: "positive" | "danger";
  /** Drawn above the label, from the same vocabulary the menus and toolbar use. */
  icon: CommandIcon;
  run: () => void;
};

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
type CompactRowProps<TCtx, TRow> = {
  row: NodeGridRow<TRow>;
  columnCtx: TCtx;
  fields: CompactFields<ColumnDef<TCtx, TRow>>;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpenDetail?: (id: string) => void;
  onLongPress?: (id: string, x: number, y: number) => void;
  swipe?: RowSwipe;
  label?: string;
  expanded?: boolean;
};

export const CompactRow = memo(function CompactRow<TCtx, TRow>({
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
}: CompactRowProps<TCtx, TRow>) {
  const formatDate = useDateFormatter();
  const rowRef = useRef<HTMLDivElement>(null);
  const press = useRef<PressState>(IDLE);
  const timer = useRef<number | null>(null);
  // A long press must swallow the click that follows it, or the menu opens and the record
  // opens behind it. A completed swipe does the same.
  const consumedTap = useRef(false);

  const origin = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<SwipeAxis>("none");
  /**
   * How far the finger has travelled sideways, not how far the row has moved.
   *
   * Storing the input rather than the output is what lets the offset, the rail's fill and
   * the armed state all be derived below by the pure functions in `lib/touch/swipe` — one
   * piece of state, and a render that is a function of where the finger is.
   */
  const [travel, setTravel] = useState(0);
  /** Whether releasing would fire, as of the last move. Drives the haptic edge, not a render. */
  const armed = useRef(false);

  const endSwipe = useCallback(() => {
    origin.current = null;
    axis.current = "none";
    armed.current = false;
    setTravel(0);
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

  const accentText = textOf(fields.accent, row, columnCtx, formatDate);
  const chips = [
    accentText,
    ...fields.meta.map((column) => textOf(column, row, columnCtx, formatDate)),
  ].filter((text): text is string => Boolean(text));
  const chipTitle = [fields.accent, ...fields.meta]
    .map((column) => fullTextOf(column, row, columnCtx))
    .filter((text): text is string => Boolean(text))
    .join(" · ");

  const offset = swipeOffset(travel, "horizontal");
  const action = travel < 0 ? swipe?.left : travel > 0 ? swipe?.right : undefined;

  return (
    <div className="relative overflow-hidden">
      <SwipeRail
        action={action}
        progress={swipeProgress(travel, "horizontal")}
        fromLeft={travel > 0}
      />

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
              onLongPress(row.id, clientX, clientY);
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

          // A direction with no action configured does not move at all. Sliding a row open
          // onto a blank rail promises something and then delivers nothing on release,
          // which reads as a bug rather than as "there is nothing over here".
          if (dx < 0 ? !swipe.left : !swipe.right) {
            setTravel(0);
            return;
          }

          setTravel(dx);

          /*
           * The arming edge, felt rather than read.
           *
           * A phone gesture has no cursor and no hover, so the only way to know a swipe has
           * gone far enough without watching the rail is a tick at the moment it does. Fired
           * on the crossing in both directions — backing off below the threshold is news too.
           */
          const nowArmed = swipeAction(dx, axis.current) !== "none";
          if (nowArmed !== armed.current) {
            armed.current = nowArmed;
            haptic(nowArmed ? 12 : 6);
          }
        }}
        onPointerUp={(event) => {
          clearTimer();
          press.current = pressUp();

          if (!swipe || !origin.current) return endSwipe();
          const dx = event.clientX - origin.current.x;
          const fired = swipeAction(dx, axis.current);
          const handler =
            fired === "left" ? swipe.left : fired === "right" ? swipe.right : null;
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
            ? {
                touchAction: "pan-y",
                transform: `translateX(${offset}px)`,
                /*
                 * Animated on the way home, never on the way out.
                 *
                 * `travel` is zero only between gestures, so this switches itself on for
                 * exactly the render that releases the row and off again the moment the
                 * next one starts — a row that eased towards a finger already somewhere
                 * else would feel like it was being dragged through mud.
                 *
                 * `prefers-reduced-motion` zeroes this globally in `globals.css`.
                 */
                transition:
                  travel === 0 ? "transform 180ms cubic-bezier(.2,.9,.3,1)" : "none",
              }
            : undefined
        }
        onClick={(event) => {
          if (consumedTap.current) {
            consumedTap.current = false;
            return;
          }
          // Inline controls inside a cell (an expander, a checkbox) handle their own tap.
          if ((event.target as HTMLElement).closest("input, select, button")) {
            onSelect(row.id);
            return;
          }
          onSelect(row.id);
          onOpenDetail?.(row.id);
        }}
        className={[
          "relative flex min-h-tap w-full items-center gap-2.5 border-b border-rule/60 py-2 pr-3 pl-2.5 text-left",
          // Opaque so the swipe track behind it stays hidden until the row actually moves.
          selected ? "bg-select" : "bg-surface",
          /*
           * A drag across a row is a swipe, not a text selection.
           *
           * Without this the gesture leaves a word highlighted behind it — and on a phone,
           * dragging across text is also what raises the selection handles and the copy
           * callout, so the row would arrive at the end of a swipe wearing UI nobody asked
           * for. Inputs opt back in: renaming a row in place still has to select its text.
           */
          swipe ? "select-none [&_input]:select-text" : "",
        ].join(" ")}
      >
        <RowSelectedContext.Provider value={selected}>
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
                title={chipTitle || undefined}
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
        </RowSelectedContext.Provider>
      </div>
    </div>
  );
}) as <TCtx, TRow>(props: CompactRowProps<TCtx, TRow>) => ReactElement;

/**
 * What the swipe is about to do, revealed as the row slides off it.
 *
 * The answer to "what happens if I let go" is on screen the whole time the finger is down,
 * in three registers at once: the colour says which half of the vocabulary this is, the
 * glyph says which verb, and the word says it outright. Colour alone would fail anyone who
 * cannot tell the two hues apart, and a glyph alone asks you to have learned it.
 *
 * **The rail is at full strength from the first pixel.** An earlier pass faded it in with
 * the gesture, which is prettier for the first ten pixels and unreadable for them: white on
 * a 30%-alpha green over the row surface has no contrast to speak of, in either scheme. So
 * the *content* is what ramps — it fades and grows into place, and pops once at the point
 * releasing would fire. That is the same information, carried by the layer that can afford
 * to be faint.
 */
function SwipeRail({
  action,
  progress,
  fromLeft,
}: {
  action: RowSwipeAction | undefined;
  /** 0 to 1, where 1 means releasing fires. */
  progress: number;
  /** Which edge the rail is anchored to — the one the row is sliding away from. */
  fromLeft: boolean;
}) {
  if (!action || progress === 0) return null;

  const armed = progress >= 1;

  return (
    <div
      aria-hidden
      className={`absolute inset-0 flex items-center ${
        action.tone === "danger" ? "bg-priority-a" : "bg-swipe-done"
      } ${fromLeft ? "justify-start" : "justify-end"}`}
    >
      <div
        // `px-2.5` and 11px type so the glyph and a word like "Complete" both sit inside the
        // trigger distance. At `px-4` and 13px the label was still sliding into view at the
        // point where letting go would already have fired it, which is the one moment it has
        // to be readable.
        className="flex flex-col items-center gap-0.5 px-2.5 text-white [&_svg]:h-5 [&_svg]:w-5"
        style={{
          opacity: 0.55 + 0.45 * progress,
          // The pop at the threshold. Small — this is a confirmation, not an animation.
          transform: `scale(${armed ? 1.08 : 0.85 + 0.15 * progress})`,
          transition: "transform 120ms ease-out",
        }}
      >
        <CommandGlyph icon={action.icon} />
        <span className="text-[0.6875rem] font-semibold whitespace-nowrap">
          {action.label}
        </span>
      </div>
    </div>
  );
}

function textOf<TCtx, TRow>(
  column: ColumnDef<TCtx, TRow> | null,
  row: NodeGridRow<TRow>,
  ctx: TCtx,
  formatDate: (dateKey: string | null | undefined) => string,
): string | null {
  if (!column) return null;
  const raw = column.compactTextWithCtx
    ? column.compactTextWithCtx(row, ctx)
    : column.compactText
      ? column.compactText(row)
      : (column.filterValue?.(row) ?? null);
  const text = column.filterKind === "date" ? formatDate(raw) : raw;
  return text && text.trim() !== "" ? text : null;
}

function fullTextOf<TCtx, TRow>(
  column: ColumnDef<TCtx, TRow> | null,
  row: NodeGridRow<TRow>,
  ctx: TCtx,
): string | null {
  if (!column) return null;
  const raw = column.compactTextWithCtx
    ? column.compactTextWithCtx(row, ctx)
    : column.compactText
      ? column.compactText(row)
      : (column.filterValue?.(row) ?? null);
  if (!raw || raw.trim() === "") return null;
  return column.filterKind === "date" ? formatFullDateKey(raw) : raw;
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
