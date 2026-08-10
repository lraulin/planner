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
import {
  metricMetaChips,
  metricPriorityText,
  metricTrailingDate,
} from "@/lib/metrics/compactRow";
import type { MetricListRow } from "@/lib/metrics/types";
import { useDisplaySettings } from "@/components/settings/SettingsProvider";
import { formatFullDateKey, type DateFormatId } from "@/lib/dateFormat";

export type MetricGroup = {
  key: string;
  /** `null` for the ungrouped list — no header is drawn. */
  label: string | null;
  rows: MetricListRow[];
};

/**
 * A metrics list on a phone, for the **Goal form's Metrics tab only**.
 *
 * The Metrics tab itself no longer comes through here: it is a `DataGrid`, so below `md` it
 * gets `CompactRow` like every other grid. What is left is the goal form's panel, which is a
 * few rows inside a drawer rather than a module list — it has no columns, no filters and no
 * grid state to hang them on, which is what `CompactRow` needs.
 *
 * The *shape* still deliberately matches `CompactRow` so the two lists feel like one app: each
 * metric is a two-line card with priority as a colour bar, the title with the date of its last
 * reading, and a meta line of value / target / category beneath.
 *
 * Tap opens the metric and long press opens the row menu, translating the desktop double-click
 * and right-click.
 */
export function MetricCompactList({
  groups,
  selectedId,
  onOpen,
  onRowMenu,
}: {
  groups: MetricGroup[];
  /** Highlighted row, when the view tracks a selection (the Metrics tab does; the goal form does not). */
  selectedId?: string | null;
  onOpen: (id: string) => void;
  /** Long-press menu. Omitted where the surface has no row commands. */
  onRowMenu?: (id: string, x: number, y: number) => void;
}) {
  const { value: displaySettings } = useDisplaySettings();
  return (
    <div className="flex flex-col" role="listbox" aria-label="Metrics">
      {groups.map((group) => (
        <div
          key={group.key || "all"}
          role="group"
          aria-label={group.label ?? undefined}
        >
          {group.label != null && (
            <h3 className="sticky top-0 z-10 border-b border-rule bg-surface-raised px-3 py-1.5 text-[0.75rem] font-medium text-ink-muted">
              Owner: {group.label} ({group.rows.length}{" "}
              {group.rows.length === 1 ? "item" : "items"})
            </h3>
          )}
          {group.rows.map((row) => (
            <MetricCompactRow
              key={row.id}
              row={row}
              dateFormat={displaySettings.dateFormat}
              selected={row.id === (selectedId ?? null)}
              onOpen={() => onOpen(row.id)}
              onLongPress={onRowMenu ? (x, y) => onRowMenu(row.id, x, y) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function MetricCompactRow({
  row,
  dateFormat,
  selected,
  onOpen,
  onLongPress,
}: {
  row: MetricListRow;
  dateFormat: DateFormatId;
  selected: boolean;
  onOpen: () => void;
  onLongPress?: (x: number, y: number) => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const press = useRef<PressState>(IDLE);
  const timer = useRef<number | null>(null);
  // A long press has to swallow the tap that follows it, or the menu opens with the metric
  // sheet already on top of it.
  const consumedTap = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const priority = metricPriorityText(row);
  // The bar carries the letter as a hue; the rank ("A1" versus "A3") is only legible as text,
  // so it leads the meta line — the same split `CompactRow` makes.
  const chips = [priority, ...metricMetaChips(row)].filter((chip) => chip !== "");
  const lastDate = metricTrailingDate(row, dateFormat);

  return (
    <button
      ref={rowRef}
      type="button"
      role="option"
      aria-selected={selected}
      onPointerDown={(event) => {
        consumedTap.current = false;
        if (!onLongPress) return;
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
      }}
      onPointerMove={(event) => {
        // Cancels at 10px, so a press that turns into a list scroll never fires the menu.
        press.current = pressMove(press.current, event.clientX, event.clientY);
        if (press.current.phase === "cancelled") clearTimer();
      }}
      onPointerUp={() => {
        clearTimer();
        press.current = pressUp();
      }}
      onPointerCancel={() => {
        clearTimer();
        press.current = pressUp();
      }}
      onClick={() => {
        if (consumedTap.current) {
          consumedTap.current = false;
          return;
        }
        onOpen();
      }}
      className={`flex min-h-tap w-full items-center gap-2.5 border-b border-rule/60 py-2 pr-3 pl-2.5 text-left ${
        selected ? "bg-select" : "bg-surface"
      }`}
    >
      <PriorityBar text={priority} />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[0.9375rem] leading-snug text-ink">
            {row.title || "Untitled"}
          </span>
          {lastDate && (
            <span
              title={formatFullDateKey(row.lastDate)}
              className="max-w-[9rem] flex-none truncate text-[0.75rem] tabular-nums text-ink-faint"
            >
              {lastDate}
            </span>
          )}
        </span>
        {chips.length > 0 && (
          <span className="truncate text-[0.75rem] text-ink-muted">
            {chips.join(" · ")}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Priority as a bar rather than a column, exactly as `CompactRow` draws it — a row with no
 * priority still spends the width, so the titles line up down the list.
 */
function PriorityBar({ text }: { text: string }) {
  const letter = text[0]?.toUpperCase();
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
