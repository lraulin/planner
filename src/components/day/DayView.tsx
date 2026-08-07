"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { NodeState } from "@/db/schema";
import { deleteNodeAction } from "@/app/outline/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { ErrorBanner } from "@/components/tabs/tabChrome";
import type { DayAssignment } from "@/lib/day/priority";
import { sortDayItems } from "@/lib/day/priority";
import type { DailyItemView, DayPayload } from "@/lib/day/types";
import type { OutlineNode } from "@/lib/tree/types";
import {
  createDailyItemAction,
  deleteDailyItemAction,
  moveDailyItemToDayAction,
  promoteToTaskAction,
  setDailyItemStateAction,
  setDailyPrioritiesAction,
  updateDailyItemTitleAction,
} from "@/app/day/actions";
import type { ActionResult } from "@/app/actionResult";
import { AppointmentsPane, type DayAppointment } from "./AppointmentsPane";
import { DailyItemsGrid } from "./DailyItemsGrid";
import { DailyNotesPane } from "./DailyNotesPane";
import { DayHeader } from "./DayHeader";

/**
 * The Day tab: appointments, today's task list, and the day's notes.
 *
 * Writes are optimistic then reconciled by `router.refresh()`, the same idiom the Schedule
 * and Notes tabs use — a check box that waits for a round trip before it ticks makes the
 * list feel like a form rather than a page you are working from.
 *
 * Three panes side by side above `md`; one at a time below it, chosen with `PaneSwitch`.
 * The list is the default because it is the reason to open this tab on a phone.
 */

type DayPane = "appointments" | "list" | "journal";

const PANES: { id: DayPane; label: string }[] = [
  { id: "appointments", label: "Appointments" },
  { id: "list", label: "List" },
  { id: "journal", label: "Journal" },
];
export function DayView({
  initial,
  today,
  appointments,
}: {
  initial: DayPayload;
  today: string;
  appointments: DayAppointment[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<DailyItemView[]>(initial.items);
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<DayPane>("list");
  /** Stub outline row for the detail drawer — enough for the header while detail loads. */
  const [detailStub, setDetailStub] = useState<OutlineNode | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<{
    itemId: string;
    nodeId: string;
    title: string;
  } | null>(null);

  /** Below `md` only the active pane is shown; above it all three always are. */
  const paneClass = (id: DayPane) => (id === pane ? "flex" : "hidden md:flex");

  // Re-sync when the server sends a new day (navigation or refresh) rather than in an
  // effect — the compare-props idiom `ScheduleView` and `WeeklyPlanView` already use.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial.items);
  }

  const settle = useCallback(
    async (result: Promise<ActionResult>) => {
      const outcome = await result;
      if (!outcome.ok) setError(outcome.error);
      router.refresh();
    },
    [router],
  );

  const patch = useCallback((itemId: string, changes: Partial<DailyItemView>) => {
    setItems((current) =>
      sortDayItems(
        current.map((item) => (item.id === itemId ? { ...item, ...changes } : item)),
      ),
    );
  }, []);

  const onCreate = useCallback(
    (title: string) => {
      // No optimistic row: the id comes from the server, and a placeholder id would break
      // the very next drag or check box aimed at it.
      void settle(createDailyItemAction({ day: initial.day, title }));
    },
    [initial.day, settle],
  );

  const onToggleComplete = useCallback(
    (itemId: string, done: boolean) => {
      patch(itemId, {
        completedAt: done ? new Date() : null,
        state: done ? "completed" : "not_started",
      });
      void settle(setDailyItemStateAction(itemId, done ? "completed" : "not_started"));
    },
    [patch, settle],
  );

  const onSetState = useCallback(
    (itemId: string, state: NodeState) => {
      const settling = state === "completed" || state === "cancelled";
      patch(itemId, {
        state,
        completedAt: settling ? new Date() : null,
      });
      void settle(setDailyItemStateAction(itemId, state));
    },
    [patch, settle],
  );

  const onApplyPriorities = useCallback(
    (assignments: DayAssignment[]) => {
      if (assignments.length === 0) return;
      setItems((current) => {
        const byId = new Map(assignments.map((a) => [a.id, a]));
        return sortDayItems(
          current.map((item) => {
            const next = byId.get(item.id);
            return next
              ? { ...item, priorityLetter: next.letter, priorityRank: next.rank }
              : item;
          }),
        );
      });
      void settle(setDailyPrioritiesAction(assignments));
    },
    [settle],
  );

  const onRename = useCallback(
    (itemId: string, title: string) => {
      patch(itemId, { title });
      void settle(updateDailyItemTitleAction(itemId, title));
    },
    [patch, settle],
  );

  const onDelete = useCallback(
    (itemId: string) => {
      setItems((current) => current.filter((item) => item.id !== itemId));
      void settle(deleteDailyItemAction(itemId));
    },
    [settle],
  );

  const onDeleteTask = useCallback(
    (itemId: string, nodeId: string) => {
      const item = items.find((entry) => entry.id === itemId);
      setPendingDeleteTask({
        itemId,
        nodeId,
        title: item?.title ?? "this task",
      });
    },
    [items],
  );

  const confirmDeleteTask = useCallback(() => {
    if (!pendingDeleteTask) return;
    const { itemId, nodeId } = pendingDeleteTask;
    setPendingDeleteTask(null);
    setItems((current) => current.filter((item) => item.id !== itemId));
    if (detailStub?.id === nodeId) setDetailStub(null);
    // Drop the day line and the task. Node delete alone would leave a snapshot row with
    // `node_id` nulled, which still looks like work on the day.
    void settle(deleteDailyItemAction(itemId));
    void settle(deleteNodeAction(nodeId));
  }, [pendingDeleteTask, detailStub, settle]);

  const onMoveToDay = useCallback(
    (itemId: string, target: string) => {
      setItems((current) => current.filter((item) => item.id !== itemId));
      void settle(moveDailyItemToDayAction(itemId, target));
    },
    [settle],
  );

  const onPromote = useCallback(
    (itemId: string) => {
      void settle(promoteToTaskAction(itemId));
    },
    [settle],
  );

  const onOpenTask = useCallback((nodeId: string, title: string) => {
    setDetailStub(taskStub(nodeId, title));
  }, []);

  const detailNode = useMemo(() => {
    if (!detailStub) return null;
    // Prefer the live title from the day list when the task is still on this day.
    const live = items.find((item) => item.nodeId === detailStub.id);
    return live ? { ...detailStub, name: live.title } : detailStub;
  }, [detailStub, items]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <DayHeader day={initial.day} today={today} mode="day" />
      {error && <ErrorBanner message={error} />}

      <PaneSwitch active={pane} onSelect={setPane} />

      <div className="flex min-h-0 flex-1">
        <AppointmentsPane
          appointments={appointments}
          weekKey={initial.day}
          className={paneClass("appointments")}
        />

        <div className={`min-h-0 flex-1 flex-col ${paneClass("list")}`}>
          <DailyItemsGrid
            items={items}
            onCreate={onCreate}
            onToggleComplete={onToggleComplete}
            onSetState={onSetState}
            onApplyPriorities={onApplyPriorities}
            onRename={onRename}
            onPromote={onPromote}
            onDelete={onDelete}
            onDeleteTask={onDeleteTask}
            onMoveToDay={onMoveToDay}
            onOpenTask={onOpenTask}
            emptyHint="Nothing here yet. Type below to add what you are doing today, or drag tasks in from the Task Chooser."
          />
        </div>

        <DailyNotesPane
          key={initial.day}
          day={initial.day}
          initialBody={initial.journal?.body ?? ""}
          className={paneClass("journal")}
        />
      </div>

      <NodeDetailDrawer node={detailNode} onClose={() => setDetailStub(null)} />

      <ConfirmDialog
        open={pendingDeleteTask !== null}
        title="Delete this task?"
        message={
          pendingDeleteTask
            ? `“${pendingDeleteTask.title}” will be removed from the outline and this day. Cancelled lines stay on the day; this is permanent.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDeleteTask}
        onCancel={() => setPendingDeleteTask(null)}
      />
    </div>
  );
}

/**
 * Enough of an `OutlineNode` for the detail drawer header while `loadNodeDetail` runs.
 * Day view does not have the full outline in memory — only `nodeId` and the display title.
 */
function taskStub(id: string, name: string): OutlineNode {
  const now = new Date(0);
  return {
    id,
    parentId: null,
    type: "task",
    name,
    sortKey: "",
    priorityLetter: null,
    priorityRank: null,
    tcPriorityLetter: null,
    tcPriorityRank: null,
    state: "not_started",
    deadline: null,
    focus: false,
    collapsed: false,
    notes: "",
    isInbox: false,
    completedAt: null,
    dateCompleted: null,
    createdAt: now,
    updatedAt: now,
    depth: 0,
    effortMinutes: null,
    effortLeftMinutes: null,
    actualEffortMinutes: null,
    percentComplete: null,
    contexts: null,
    actualStartDate: null,
    description: "",
    effortDriven: null,
    leadTimeMinutes: null,
    deadlineLeadTimeMinutes: null,
    place: "",
    expectedCost: null,
    costLow: null,
    costHigh: null,
    costToDate: null,
    color: null,
    category: null,
    importance: null,
    targetStart: null,
    targetEnd: null,
    deferredDate: null,
    recurrenceFrequency: "none",
    purpose: "",
    assignedTo: "",
    definition: "",
    range: "",
    isDream: false,
    contactId: null,
    lapLetter: null,
    lapRank: null,
    resultAreaName: null,
    projectPriorityLetter: null,
    projectPriorityRank: null,
    effectiveCategory: null,
    effortRollupMinutes: null,
    effortLeftRollupMinutes: null,
    actualEffortRollupMinutes: 0,
    percentCompleteRollup: 0,
    childCount: 0,
    hasChildren: false,
    hasActiveChildren: false,
    hidden: false,
    shelf: null,
  };
}

/**
 * Three panes will not sit side by side on a 390px screen, so below `md` the Day tab shows
 * one at a time and this switches between them.
 *
 * All three stay mounted and are shown or hidden with CSS rather than branching on
 * `useIsCompact()`: the hook's server snapshot is `false`, so a JS branch would render the
 * three-pane desktop layout on the server and visibly swap it on hydration. It also keeps
 * the journal's autosave draft alive while you look at the list.
 */
function PaneSwitch({
  active,
  onSelect,
}: {
  active: DayPane;
  onSelect: (pane: DayPane) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Day pane"
      className="flex flex-none gap-px border-b border-rule px-3 py-1.5 md:hidden"
    >
      {PANES.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          aria-pressed={active === option.id}
          className={`min-h-tap flex-1 rounded text-[0.8125rem] transition-colors ${
            active === option.id ? "bg-select font-medium text-ink" : "text-ink-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
