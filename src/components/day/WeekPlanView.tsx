"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorBanner } from "@/components/tabs/tabChrome";
import { buildChooserItems, defaultSettings } from "@/lib/chooser/views";
import { formatPriority } from "@/lib/tree/format";
import type { OutlineNode } from "@/lib/tree/types";
import { isDayItemSettled } from "@/lib/day/priority";
import type { DailyItemView, WeekPayload } from "@/lib/day/types";
import { moveDailyItemToDayAction, planNodeForDayAction } from "@/app/day/actions";
import type { ActionResult } from "@/app/actionResult";
import { WideSurface } from "@/components/shell/WideSurface";
import { DayHeader } from "./DayHeader";

/**
 * The week planner: the master task list on the left, seven day columns on the right.
 *
 * This is the "decide ahead of time" half of the tab — "I'll do this Wednesday, remember
 * that on Friday." Dropping a task on a column is a **statement of intent, not a deadline**:
 * it creates a daily-list row and nothing about it can ever go overdue.
 *
 * The rail is the Task Chooser's own To-do List, built with `buildChooserItems`, so the two
 * lists are the same list and cannot drift. Tasks already sitting on an open day drop out of
 * it, which is Franklin Covey's "it left the master list once you scheduled it".
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function columnLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()}`;
}

/** What a drag carries. Either a task from the rail, or a row already on some day. */
const NODE_MIME = "application/x-planner-node";
const ITEM_MIME = "application/x-planner-daily-item";

export function WeekPlanView({
  initial,
  nodes,
  today,
}: {
  initial: WeekPayload;
  nodes: OutlineNode[];
  today: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const settle = useCallback(
    async (result: Promise<ActionResult>) => {
      const outcome = await result;
      if (!outcome.ok) setError(outcome.error);
      router.refresh();
    },
    [router],
  );

  /** Every task currently on an open day, so the rail can hide what is already planned. */
  const plannedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const items of Object.values(initial.itemsByDay)) {
      for (const item of items) {
        if (item.nodeId && item.completedAt === null) ids.add(item.nodeId);
      }
    }
    return ids;
  }, [initial.itemsByDay]);

  const master = useMemo(() => {
    const items = buildChooserItems(nodes, {
      today,
      viewId: "todo-list",
      settings: defaultSettings("todo-list"),
    });
    // Tasks only. The chooser's To-do List also offers task-less projects as choosable work
    // (manual §8), but a day page holds what you can finish in a day — a project that wants
    // to be on one should have a task under it saying what you are actually doing.
    return items.filter(
      (item) => item.node.type === "task" && !plannedNodeIds.has(item.node.id),
    );
  }, [nodes, today, plannedNodeIds]);

  const onDropOnDay = useCallback(
    (event: React.DragEvent, day: string) => {
      event.preventDefault();
      setDragOver(null);

      const itemId = event.dataTransfer.getData(ITEM_MIME);
      if (itemId) {
        void settle(moveDailyItemToDayAction(itemId, day));
        return;
      }

      const nodeId = event.dataTransfer.getData(NODE_MIME);
      if (nodeId) void settle(planNodeForDayAction(nodeId, day));
    },
    [settle],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <DayHeader day={initial.weekStart} today={today} mode="week" />
      {error && <ErrorBanner message={error} />}

      <WideSurface
        note="The week board is built to be seen whole — scroll sideways, or use the Day tab on a phone."
        minWidthClass="max-md:min-w-[64rem]"
      >
        {/* Master task list */}
        <section
          aria-label="Master task list"
          className="flex min-h-0 w-72 flex-none flex-col border-r border-rule"
        >
          <header className="flex flex-none items-baseline justify-between border-b border-rule px-3 py-1.5">
            <h2 className="text-[0.75rem] font-semibold tracking-wide text-ink-muted uppercase">
              Master Tasks
            </h2>
            <Link
              href="/chooser"
              className="text-[0.6875rem] text-ink-faint hover:text-ink"
            >
              Task Chooser
            </Link>
          </header>

          <ul className="min-h-0 flex-1 overflow-auto py-1">
            {master.length === 0 ? (
              <li className="px-3 py-2 text-[0.8125rem] text-ink-faint">
                Nothing left to plan — everything available is already on a day.
              </li>
            ) : (
              master.map((item) => (
                <li
                  key={item.node.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(NODE_MIME, item.node.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="flex cursor-grab items-baseline gap-2 px-3 py-1 text-[0.8125rem] hover:bg-surface-raised"
                  title={item.breadcrumb.join(" › ")}
                >
                  <span className="tabular w-6 flex-none text-ink-faint">
                    {formatPriority(
                      item.node.tcPriorityLetter,
                      item.node.tcPriorityRank,
                    )}
                  </span>
                  <span className="truncate text-ink">{item.node.name}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Seven day columns */}
        <div className="grid min-h-0 flex-1 grid-cols-7">
          {initial.days.map((day) => (
            <section
              key={day}
              aria-label={columnLabel(day)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOver(day);
              }}
              onDragLeave={() =>
                setDragOver((current) => (current === day ? null : current))
              }
              onDrop={(event) => onDropOnDay(event, day)}
              className={[
                "flex min-h-0 flex-col border-r border-rule last:border-r-0",
                dragOver === day ? "bg-surface-raised" : "",
              ].join(" ")}
            >
              <header
                className={[
                  "flex-none border-b border-rule px-2 py-1.5 text-center",
                  day === today ? "bg-surface-raised" : "",
                ].join(" ")}
              >
                <Link
                  href={`/schedule/day?date=${day}`}
                  className={[
                    "text-[0.75rem] hover:underline",
                    day === today ? "font-semibold text-ink" : "text-ink-muted",
                  ].join(" ")}
                >
                  {columnLabel(day)}
                </Link>
              </header>

              <ul className="min-h-0 flex-1 overflow-auto p-1">
                {(initial.itemsByDay[day] ?? []).map((item) => (
                  <WeekItem key={item.id} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </WideSurface>
    </div>
  );
}

function WeekItem({ item }: { item: DailyItemView }) {
  // Cancelled settles like completed (strikethrough); only the day list's X distinguishes it.
  const settled = isDayItemSettled(item);
  const forwarded = item.forwardedTo !== null;

  return (
    <li
      // A forwarded row is history — the live copy is on the day it moved to, so dragging
      // this one would fork the record rather than reschedule anything.
      draggable={!forwarded}
      onDragStart={(event) => {
        event.dataTransfer.setData(ITEM_MIME, item.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={[
        "flex items-baseline gap-1 rounded px-1 py-0.5 text-[0.75rem]",
        forwarded ? "opacity-60" : "cursor-grab hover:bg-surface",
      ].join(" ")}
      title={forwarded ? `Forwarded to ${item.forwardedTo}` : item.title}
    >
      <span className="tabular w-5 flex-none text-ink-faint">
        {forwarded ? "→" : formatPriority(item.priorityLetter, item.priorityRank)}
      </span>
      <span
        className={
          settled ? "truncate text-ink-faint line-through" : "truncate text-ink"
        }
      >
        {item.title}
      </span>
    </li>
  );
}
