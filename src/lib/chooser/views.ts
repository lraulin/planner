import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import { dayString, daysBetween, effectiveDeadline } from "./dates";
import { DEFAULT_WEIGHTS, scoreItem, type ChooserWeights } from "./score";
import type {
  ChooserDateFilter,
  ChooserItem,
  ChooserSettings,
  ChooserViewId,
} from "./types";

/**
 * Which items the Task Chooser considers, how each view weights them, and the date bands
 * that filter the result.
 *
 * Pure: `today` and the node list are arguments, so every rule here is testable without a
 * grid or a database.
 */

/** Facts about a candidate that only its ancestors can supply. */
type Ancestry = {
  projectId: string | null;
  areaImportance: number;
  breadcrumb: string[];
  deadline: Date | null;
};

/** One upward walk per candidate, rather than one per fact. */
function ancestryOf(node: OutlineNode, byId: Map<string, OutlineNode>): Ancestry {
  let projectId: string | null = node.type === "project" ? node.id : null;
  let areaImportance = 0;
  const names: string[] = [];

  let cur: OutlineNode | undefined = node.parentId
    ? byId.get(node.parentId)
    : undefined;
  while (cur) {
    if (projectId === null && cur.type === "project") projectId = cur.id;
    if (cur.type === "result_area" && cur.importance !== null) {
      // Nearest result area wins; nested areas above it do not stack.
      if (areaImportance === 0) areaImportance = cur.importance;
    }
    names.push(cur.name || "Untitled");
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  return {
    projectId,
    areaImportance,
    breadcrumb: names.reverse(),
    deadline: effectiveDeadline(node, byId),
  };
}

/**
 * A view's extra candidate rule, applied after the base rule and after scoring facts are
 * known. `null` means the view takes every candidate.
 */
type ViewKeep = (item: ChooserItem, today: string | null) => boolean;

export type ChooserView = {
  id: ChooserViewId;
  label: string;
  weights: ChooserWeights;
  /** Settings this view starts from before anything is stored. */
  defaults: Pick<ChooserSettings, "onlyNextAction" | "useTaskPriorityOrder">;
  keep: ViewKeep | null;
  /** Shown under the Settings heading, so the view's intent is written down somewhere. */
  description: string;
};

const NO_NEXT_ACTION = { onlyNextAction: false, useTaskPriorityOrder: false } as const;

export const CHOOSER_VIEWS: ChooserView[] = [
  {
    id: "best-overall",
    label: "Best Overall",
    weights: DEFAULT_WEIGHTS,
    defaults: NO_NEXT_ACTION,
    keep: null,
    description: "Best tasks across all your projects, regardless of result area.",
  },
  {
    id: "next-action",
    label: "Next Action Only",
    weights: DEFAULT_WEIGHTS,
    defaults: { onlyNextAction: true, useTaskPriorityOrder: true },
    keep: null,
    description: "One item per project — the next thing that project needs.",
  },
  {
    id: "todo-list",
    label: "To-do List",
    // Today's list: what is already underway, already focused, or already due.
    weights: { ...DEFAULT_WEIGHTS, focusBonus: 35, targetStartReached: 25 },
    defaults: NO_NEXT_ACTION,
    keep: (item, today) => {
      if (item.node.focus) return true;
      if (item.node.state === "in_progress" || item.node.state === "should_delegate") {
        return true;
      }
      const start = daysOut(item.node.targetStart, today);
      if (start !== null && start <= 0) return true;
      const deadline = daysOut(item.effectiveDeadline, today);
      return deadline !== null && deadline <= 1;
    },
    description: "A prioritised list for today: started, focused, or already due.",
  },
  {
    id: "urgent",
    label: "Urgent",
    // Dates dominate the letter. An overdue D outranks a calm A here, on purpose.
    weights: {
      ...DEFAULT_WEIGHTS,
      deadlineOverdue: 400,
      deadlineToday: 300,
      deadlineTomorrow: 200,
      deadlineSoon: 120,
      targetEndPast: 100,
      targetStartReached: 40,
    },
    defaults: NO_NEXT_ACTION,
    keep: null,
    description:
      "Dates outweigh priority — what is on fire, whatever letter it carries.",
  },
  {
    id: "deadlines",
    label: "Deadlines",
    // Only deadlined work, ordered almost purely by how close the date is.
    weights: {
      ...DEFAULT_WEIGHTS,
      priorityTop: 40,
      priorityLetterStep: 8,
      priorityRankStep: 1,
      deadlineOverdue: 400,
      deadlineToday: 300,
      deadlineTomorrow: 200,
      deadlineSoon: 100,
      deadlineSoonDays: 30,
      focusBonus: 5,
    },
    defaults: NO_NEXT_ACTION,
    keep: (item) => item.effectiveDeadline !== null,
    description: "Only work with a deadline, ordered by how close that deadline is.",
  },
];

export function chooserView(id: ChooserViewId): ChooserView {
  return CHOOSER_VIEWS.find((view) => view.id === id) ?? CHOOSER_VIEWS[0];
}

export function defaultSettings(id: ChooserViewId): ChooserSettings {
  const view = chooserView(id);
  return {
    weights: view.weights,
    onlyNextAction: view.defaults.onlyNextAction,
    useTaskPriorityOrder: view.defaults.useTaskPriorityOrder,
    includeDeferred: false,
  };
}

/**
 * The base candidate rule, from manual §8: "leaf tasks (and task-less projects)".
 *
 * Result areas and goals are never candidates — they are places work lives, not work. A
 * project qualifies only when nothing hangs off it, since otherwise its children are the
 * real choices. Zero-effort "next action reminder" tasks (§7.2.5) stay in: they are
 * visible in Achieve's own screenshot, and a reminder is still a thing you can pick.
 */
export function isChooserCandidate(
  node: OutlineNode,
  includeDeferred: boolean,
): boolean {
  if (node.state === "completed" || node.state === "cancelled") return false;
  if (!includeDeferred && node.state === "postponed") return false;
  if (node.type === "task") return !node.hasChildren;
  if (node.type === "project") return !node.hasChildren;
  return false;
}

/**
 * Score every candidate and return them in chooser order.
 *
 * Ties break on the tighter deadline and then the name, so the list is stable across
 * renders rather than reshuffling under the cursor.
 */
export function buildChooserItems(
  nodes: OutlineNode[],
  opts: {
    /** `null` on the server / before hydration; see the note on `daysOut`. */
    today: string | null;
    viewId: ChooserViewId;
    settings: ChooserSettings;
    /** Subtree to restrict to, from a scope picker. `null` is the whole tree. */
    scopeId?: string | null;
  },
): ChooserItem[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const view = chooserView(opts.viewId);
  const { settings, today } = opts;

  const items: ChooserItem[] = [];

  nodes.forEach((node, order) => {
    if (!isChooserCandidate(node, settings.includeDeferred)) return;
    if (!inScope(node, opts.scopeId ?? null, byId)) return;

    const ancestry = ancestryOf(node, byId);
    const item: ChooserItem = {
      node,
      score: scoreItem(
        {
          lapLetter: node.lapLetter,
          lapRank: node.lapRank,
          focus: node.focus,
          effectiveDeadline: ancestry.deadline,
          targetStart: node.targetStart,
          targetEnd: node.targetEnd,
          areaImportance: ancestry.areaImportance,
        },
        today,
        settings.weights,
      ),
      effectiveDeadline: ancestry.deadline,
      projectId: ancestry.projectId,
      breadcrumb: ancestry.breadcrumb,
      order,
    };

    if (view.keep && !view.keep(item, today)) return;
    items.push(item);
  });

  items.sort(compareItems);

  return settings.onlyNextAction ? applyNextActionFilter(items, settings) : items;
}

function compareItems(a: ChooserItem, b: ChooserItem): number {
  if (a.score !== b.score) return b.score - a.score;

  const aDue = a.effectiveDeadline?.getTime() ?? Infinity;
  const bDue = b.effectiveDeadline?.getTime() ?? Infinity;
  if (aDue !== bDue) return aDue - bDue;

  return a.node.name.localeCompare(b.node.name, undefined, { numeric: true });
}

function inScope(
  node: OutlineNode,
  scopeId: string | null,
  byId: Map<string, OutlineNode>,
): boolean {
  if (!scopeId) return true;
  let cur: OutlineNode | undefined = node;
  while (cur) {
    if (cur.id === scopeId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/**
 * Manual §8.3: collapse to one item per project.
 *
 * With `useTaskPriorityOrder`, the survivor is the project's **topmost** item in outline
 * order — the same "simple" next action the Outline shows. Without it, the survivor is the
 * project's **highest-scoring** item, which may be neither topmost nor obvious.
 *
 * Items with no project ancestor pass through untouched: since the hierarchy relaxation in
 * the quick-capture spec, a task need not live under a project at all, and dropping those
 * would silently hide loose work.
 *
 * `items` must already be in chooser order; the result preserves it.
 */
export function applyNextActionFilter(
  items: ChooserItem[],
  settings: Pick<ChooserSettings, "useTaskPriorityOrder">,
): ChooserItem[] {
  const winnerByProject = new Map<string, ChooserItem>();

  for (const item of items) {
    if (item.projectId === null) continue;
    const current = winnerByProject.get(item.projectId);
    if (!current) {
      winnerByProject.set(item.projectId, item);
      continue;
    }
    // `items` is score-ordered, so the incumbent already wins the score comparison; only
    // the priority-order rule can displace it.
    if (settings.useTaskPriorityOrder && item.order < current.order) {
      winnerByProject.set(item.projectId, item);
    }
  }

  const kept = new Set([...winnerByProject.values()].map((item) => item.node.id));

  return items.filter((item) => item.projectId === null || kept.has(item.node.id));
}

/**
 * Days from `today` to a date. `null` when either side is missing — including on the
 * server, where `today` is unknown, so every date-dependent rule stands down rather than
 * quietly comparing against `NaN`.
 */
function daysOut(date: Date | null, today: string | null): number | null {
  return date && today ? daysBetween(today, dayString(date)) : null;
}

const DUE_SOON_DAYS = 7;

/**
 * Manual §8.1.3. **Display only** — the manual is explicit that the date filter "does not
 * affect the scoring of the tasks", and a test holds us to it.
 *
 * `group-by-deadline` filters nothing; it changes how the rows are grouped instead.
 */
export function applyDateFilter(
  items: ChooserItem[],
  filter: ChooserDateFilter,
  today: string | null,
): ChooserItem[] {
  if (filter === "none" || filter === "group-by-deadline") return items;
  // Nothing to measure against yet — filter nothing rather than everything.
  if (!today) return items;

  return items.filter((item) => {
    const deadline = daysOut(item.effectiveDeadline, today);
    const start = daysOut(item.node.targetStart, today);
    const end = daysOut(item.node.targetEnd, today);

    switch (filter) {
      case "current":
        // Started work, work whose start date has arrived (or was never set), or work
        // already up against its deadline.
        if (
          item.node.state === "in_progress" ||
          item.node.state === "should_delegate"
        ) {
          return true;
        }
        if (start === null || start <= 0) return true;
        return deadline !== null && deadline <= 0;

      case "overdue":
        return deadline !== null && deadline < 0;

      case "behind":
        return (end !== null && end < 0) || (deadline !== null && deadline < 0);

      case "due-soon":
        return (
          (end !== null && end <= DUE_SOON_DAYS) ||
          (deadline !== null && deadline <= DUE_SOON_DAYS)
        );

      case "next-7":
        return withinDays(7, start, end, deadline);
      case "next-14":
        return withinDays(14, start, end, deadline);
      case "next-30":
        return withinDays(30, start, end, deadline);
    }
  });
}

/** "…occurring in the next N days **or earlier**" — so past dates qualify too. */
function withinDays(
  days: number,
  start: number | null,
  end: number | null,
  deadline: number | null,
): boolean {
  return [start, end, deadline].some((value) => value !== null && value <= days);
}

export const DATE_FILTERS: { id: ChooserDateFilter; label: string }[] = [
  { id: "none", label: "None" },
  { id: "current", label: "Current" },
  { id: "overdue", label: "Overdue" },
  { id: "behind", label: "Behind Schedule" },
  { id: "due-soon", label: "Due Soon" },
  { id: "next-7", label: "Next Seven Days" },
  { id: "next-14", label: "Next 14 Days" },
  { id: "next-30", label: "Next 30 Days" },
  { id: "group-by-deadline", label: "Group By Deadline" },
];

/** Deadline buckets for the `Group By Deadline` option, most urgent first. */
const DEADLINE_BANDS: {
  id: string;
  label: string;
  holds: (days: number | null) => boolean;
}[] = [
  { id: "overdue", label: "Overdue", holds: (d) => d !== null && d < 0 },
  { id: "today", label: "Today", holds: (d) => d === 0 },
  { id: "tomorrow", label: "Tomorrow", holds: (d) => d === 1 },
  {
    id: "this-week",
    label: "Next Seven Days",
    holds: (d) => d !== null && d > 1 && d <= DUE_SOON_DAYS,
  },
  { id: "later", label: "Later", holds: (d) => d !== null && d > DUE_SOON_DAYS },
  { id: "none", label: "No Deadline", holds: (d) => d === null },
];

/**
 * Turn scored items into the flat row list `DataGrid` renders, inserting deadline group
 * headers when the date filter asks for them.
 *
 * `limit` is Achieve's Show More / Show Less count and is applied to the **items**, before
 * grouping, so "20 of 47" counts tasks rather than headers.
 */
export function chooserRows(
  items: ChooserItem[],
  filter: ChooserDateFilter,
  today: string | null,
): GridRow[] {
  if (filter !== "group-by-deadline") {
    return items.map((item) => ({
      kind: "node",
      id: item.node.id,
      node: item.node,
      depth: 0,
    }));
  }

  const rows: GridRow[] = [];

  for (const band of DEADLINE_BANDS) {
    const inBand = items.filter((item) =>
      band.holds(daysOut(item.effectiveDeadline, today)),
    );
    if (inBand.length === 0) continue;

    rows.push({
      kind: "group",
      id: `deadline:${band.id}`,
      label: band.label,
      count: inBand.length,
      depth: 0,
      collapsed: false,
    });
    for (const item of inBand) {
      rows.push({ kind: "node", id: item.node.id, node: item.node, depth: 0 });
    }
  }

  return rows;
}
