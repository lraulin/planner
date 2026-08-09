import type { NodeState } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import { effectiveState } from "@/lib/tree/shelving";
import { walkUp } from "@/lib/tree/walkUp";
import { dayString, daysBetween, effectiveDeadline } from "./dates";
import { DEFAULT_WEIGHTS, scoreItem, type ChooserWeights } from "./score";
import { compareTcPriority, TC_LETTERS } from "./tcPriority";
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

  const start = node.parentId ? byId.get(node.parentId) : undefined;
  for (const cur of walkUp(start, byId)) {
    if (projectId === null && cur.type === "project") projectId = cur.id;
    if (cur.type === "result_area" && cur.importance !== null) {
      // Nearest result area wins; nested areas above it do not stack.
      if (areaImportance === 0) areaImportance = cur.importance;
    }
    names.push(cur.name || "Untitled");
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
  /** Work states this view shows before anything is stored. */
  states: NodeState[];
  /** Shown under the Settings heading, so the view's intent is written down somewhere. */
  description: string;
  /**
   * Order by the hand-maintained **TC Priority** instead of by score, group the rows under
   * their letter, and show the TC Priority column in place of the outline's Pri.
   *
   * This is what makes the To-do List a Covey-style list rather than another ranked query:
   * the order is what you dragged it to, and a shifting deadline does not rearrange it.
   * Score still orders the items you have not ranked yet, which sit below the ranked ones.
   */
  tcPriority: boolean;
};

const NO_NEXT_ACTION = { onlyNextAction: false, useTaskPriorityOrder: false } as const;

/**
 * States a chooser view shows by default: everything that is still live work.
 *
 * `completed` and `cancelled` are out — a list of what to do next has no business
 * offering things that are finished or abandoned. `postponed` is out too, which is what
 * Achieve's Deferred toggle turns back on. All three remain tickable in Settings.
 */
export const DEFAULT_STATES: NodeState[] = [
  "not_started",
  "in_progress",
  "waiting",
  "delegated",
  "should_delegate",
  "proposed",
];

/**
 * The To-do List is narrower still: only work that is genuinely actionable **by you, now**.
 *
 * `waiting`, `delegated`, and `should_delegate` are all blocked on somebody else, and
 * `proposed` is not committed to yet — none of them belong on the list you work down
 * today. Ticking them back on is one checkbox away.
 */
export const TODO_STATES: NodeState[] = ["not_started", "in_progress"];

export const CHOOSER_VIEWS: ChooserView[] = [
  {
    id: "best-overall",
    label: "Best Overall",
    weights: DEFAULT_WEIGHTS,
    defaults: NO_NEXT_ACTION,
    keep: null,
    tcPriority: false,
    states: DEFAULT_STATES,
    description: "Best tasks across all your projects, regardless of result area.",
  },
  {
    id: "next-action",
    label: "Next Action Only",
    weights: DEFAULT_WEIGHTS,
    defaults: { onlyNextAction: true, useTaskPriorityOrder: true },
    keep: null,
    tcPriority: false,
    states: DEFAULT_STATES,
    description:
      "Next action(s) per project — highest outline priority under each project (multi-A1 kept).",
  },
  {
    id: "todo-list",
    label: "To-do List",
    // Weights only order the untriaged tail; the ranked part is ordered by hand.
    weights: { ...DEFAULT_WEIGHTS, focusBonus: 35, targetStartReached: 25 },
    defaults: NO_NEXT_ACTION,
    /**
     * No extra filter: this view shows **everything currently available**, because it is
     * where you rank it. An earlier draft narrowed it to focused / started / already-due
     * work, which was self-defeating once ranking arrived — you cannot drag a task into
     * your A list if the list refuses to show it until it is already urgent.
     *
     * Narrowing is the state filter's job now, and it defaults to Not Started + In
     * Progress, which is the honest definition of "available".
     */
    keep: null,
    tcPriority: true,
    states: TODO_STATES,
    description:
      "Your hand-ranked list for today. Drag rows to reorder; unranked work sits below, by score.",
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
    tcPriority: false,
    states: DEFAULT_STATES,
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
    tcPriority: false,
    states: DEFAULT_STATES,
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
    states: view.states,
    // The To-do List *is* the master list, so planning something takes it off. The scoring
    // views are answering a different question and keep showing everything.
    hidePlanned: id === "todo-list",
    dateFilter: "none",
  };
}

/**
 * The base candidate rule, from manual §8: "leaf tasks (and task-less projects)".
 *
 * Result areas and goals are never candidates — they are places work lives, not work. A
 * project qualifies only when nothing hangs off it, since otherwise its children are the
 * real choices. Zero-effort "next action reminder" tasks (§7.2.5) stay in: they are
 * visible in Achieve's own screenshot, and a reminder is still a thing you can pick.
 *
 * **Shelved work is out**, and there is now one rule for it rather than two. The states list
 * already decided what you see, and `postponed` is off by default in every view; feeding it
 * the *effective* state means a deferred date, an indefinite shelf, and a shelf inherited
 * from an ancestor all take the same route. That last one is why a task-less "Pay Taxes"
 * project can finally be got rid of until February, and it is how a repeating routine stays
 * off this list between cycles without pretending to have a deadline.
 */
export function isChooserCandidate(
  node: OutlineNode,
  states: NodeState[],
  today: string | null = null,
): boolean {
  if (!states.includes(effectiveState(node.state, node.shelf, today))) return false;
  // Achieve: leaf work is tasks/projects with no children **or only completed children**.
  // Structural `hasChildren` still true when kids are finished; `hasActiveChildren` is the
  // chooser rule.
  if (node.type === "task") return !node.hasActiveChildren;
  if (node.type === "project") return !node.hasActiveChildren;
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
    /**
     * Tasks currently on an open day in the Day tab. Read by `settings.hidePlanned`.
     * Omitted means nothing is planned, which is what every caller that does not know
     * about the Day tab should see.
     */
    plannedNodeIds?: Set<string>;
  },
): ChooserItem[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const view = chooserView(opts.viewId);
  const { settings, today } = opts;

  const items: ChooserItem[] = [];

  nodes.forEach((node, order) => {
    if (!isChooserCandidate(node, settings.states, today)) return;
    if (!inScope(node, opts.scopeId ?? null, byId)) return;
    if (settings.hidePlanned && opts.plannedNodeIds?.has(node.id)) return;

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

  items.sort(view.tcPriority ? compareByTcThenScore : compareItems);

  return settings.onlyNextAction ? applyNextActionFilter(items, settings) : items;
}

function compareItems(a: ChooserItem, b: ChooserItem): number {
  if (a.score !== b.score) return b.score - a.score;

  const aDue = a.effectiveDeadline?.getTime() ?? Infinity;
  const bDue = b.effectiveDeadline?.getTime() ?? Infinity;
  if (aDue !== bDue) return aDue - bDue;

  return a.node.name.localeCompare(b.node.name, undefined, { numeric: true });
}

/**
 * Hand-ranked first, in the order you put them; everything else below, by score.
 *
 * `compareTcPriority` already sinks unranked items and ties them with each other, so
 * falling through to the score comparison orders exactly the untriaged tail — and a task
 * captured five minutes ago shows up there rather than vanishing.
 */
function compareByTcThenScore(a: ChooserItem, b: ChooserItem): number {
  const byTc = compareTcPriority(a.node, b.node);
  return byTc !== 0 ? byTc : compareItems(a, b);
}

function inScope(
  node: OutlineNode,
  scopeId: string | null,
  byId: Map<string, OutlineNode>,
): boolean {
  if (!scopeId) return true;
  for (const cur of walkUp(node, byId)) {
    if (cur.id === scopeId) return true;
  }
  return false;
}

/**
 * Manual §8.3 / training "Next Action Only": restrict to next actions per project.
 *
 * With `useTaskPriorityOrder` (basic NA definition): keep every candidate that shares the
 * **highest outline priority** under that project (letter, then rank). Since Achieve 1.9.6,
 * multiple A1s are all next actions — not a single survivor. Unranked letters sort after
 * every ranked rank of that letter; no priority is worst.
 *
 * Without it: keep the **highest-scoring** item only (items already arrive score-ordered).
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
  const byProject = new Map<string, ChooserItem[]>();

  for (const item of items) {
    if (item.projectId === null) continue;
    const list = byProject.get(item.projectId);
    if (list) list.push(item);
    else byProject.set(item.projectId, [item]);
  }

  const kept = new Set<string>();

  for (const group of byProject.values()) {
    if (!settings.useTaskPriorityOrder) {
      // Score order: first item is the best for that project.
      kept.add(group[0].node.id);
      continue;
    }

    let bestKey = outlinePriorityKey(group[0].node);
    for (let i = 1; i < group.length; i++) {
      const key = outlinePriorityKey(group[i].node);
      if (comparePriorityKeys(key, bestKey) < 0) bestKey = key;
    }
    for (const item of group) {
      if (comparePriorityKeys(outlinePriorityKey(item.node), bestKey) === 0) {
        kept.add(item.node.id);
      }
    }
  }

  return items.filter((item) => item.projectId === null || kept.has(item.node.id));
}

const LETTER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

/**
 * Outline Priority sort key for next-action selection. Own letter/rank only (not L.A.P.) —
 * next actions are "highest priority under the project" in the task's Priority column.
 * Rank null (bare letter) sorts after every numeric rank; no letter is last of all.
 */
function outlinePriorityKey(node: OutlineNode): [number, number] {
  if (node.priorityLetter === null) return [4, 0];
  // Unranked letter after ranks 1..n — same convention as Achieve priority sort and our
  // chooser score's unranked-after-ranked rule.
  const rank = node.priorityRank ?? Number.MAX_SAFE_INTEGER;
  return [LETTER_ORDER[node.priorityLetter] ?? 4, rank];
}

/** Negative if `a` is higher priority than `b`. */
function comparePriorityKeys(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
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

      case "behind": {
        // Manual §3.8 Behind Schedule (+ chooser date-filter help): overdue, past target
        // end, NS with past target start, or started with past target end.
        if (deadline !== null && deadline < 0) return true;
        if (end !== null && end < 0) return true;
        if (item.node.state === "not_started" && start !== null && start < 0) {
          return true;
        }
        return false;
      }

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
  /** True in a TC-priority view: group under the letter headers you drag rows onto. */
  groupByTcLetter = false,
): GridRow[] {
  // An explicit Group By Deadline wins over the view's own grouping — the user reached for
  // that control on purpose, and two sets of headers at once would be nonsense.
  if (groupByTcLetter && filter !== "group-by-deadline") {
    return tcLetterRows(items);
  }

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

/** Group-row id for a TC priority letter, e.g. `tc:A`. Parsed back by the grid's drop handler. */
export function tcLetterGroupId(letter: string): string {
  return `tc:${letter}`;
}

/** The letter a `tc:` group id names, or null when the id is not one. */
export function tcLetterFromGroupId(groupId: string): string | null {
  return groupId.startsWith("tc:") ? groupId.slice(3) : null;
}

/** Group id for the unranked tail. Dropping here removes an item from the ranking. */
export const TC_UNRANKED_GROUP_ID = "tc:unranked";

/**
 * Rows for a TC-priority view: one header per letter, then the unranked tail.
 *
 * **Every letter gets a header, even an empty one.** That is not cosmetic — the header is
 * the drop target that puts the first item into a letter, so hiding empty ones would make
 * "drag it to A" impossible exactly when A is empty, which is the first thing anyone does.
 */
function tcLetterRows(items: ChooserItem[]): GridRow[] {
  const rows: GridRow[] = [];

  for (const letter of TC_LETTERS) {
    const inLetter = items.filter((item) => item.node.tcPriorityLetter === letter);
    rows.push({
      kind: "group",
      id: tcLetterGroupId(letter),
      label: letter,
      count: inLetter.length,
      depth: 0,
      collapsed: false,
    });
    for (const item of inLetter) {
      rows.push({ kind: "node", id: item.node.id, node: item.node, depth: 0 });
    }
  }

  const unranked = items.filter((item) => item.node.tcPriorityLetter === null);
  if (unranked.length > 0) {
    rows.push({
      kind: "group",
      id: TC_UNRANKED_GROUP_ID,
      label: "Unranked",
      count: unranked.length,
      depth: 0,
      collapsed: false,
    });
    for (const item of unranked) {
      rows.push({ kind: "node", id: item.node.id, node: item.node, depth: 0 });
    }
  }

  return rows;
}
