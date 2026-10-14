import type { OutlineNode } from "./types";
import { packOutline, type OutlineWire } from "./wire";

/**
 * What a page that borrows the outline as supporting data sends to the browser.
 *
 * A tree page needs nearly the whole row and sends all of it, packed (`packOutline`). These
 * pages use the outline for one picker, one lookup or one rail, so each sends the rows it
 * actually reads and only the columns those readers touch. The consumers are typed against
 * the `Pick` exported here, which is what makes the compiler prove a component reads nothing
 * it was not sent — add a field to a consumer and its slice must name it, or typecheck fails.
 *
 * Slices are cut from the already-loaded, already user-scoped `loadOutline` result *after*
 * `derive`. A second narrow query would have to recompute `hidden`, L.A.P. and
 * `resultAreaName`, which is the drift `main-grid-tabs` rejected.
 *
 * Each slice keeps the loader's row order (depth-first), and every row it keeps is whole for
 * the columns it names: nothing here recomputes a value.
 */

// -- Metrics: the owner goal select ------------------------------------------------------

const METRIC_GOAL_KEYS = ["id", "name", "type"] as const;
export type MetricGoalNode = Pick<OutlineNode, (typeof METRIC_GOAL_KEYS)[number]>;
export type MetricGoalWire = OutlineWire<keyof MetricGoalNode>;

export function metricGoalsWire(nodes: readonly OutlineNode[]) {
  return packOutline(
    nodes.filter((node) => node.type === "goal"),
    METRIC_GOAL_KEYS,
  );
}

// -- Time chart editor: the result-area select -------------------------------------------

const TIME_CHART_AREA_KEYS = ["id", "name", "type", "hidden"] as const;
export type TimeChartResultAreaNode = Pick<
  OutlineNode,
  (typeof TIME_CHART_AREA_KEYS)[number]
>;
export type TimeChartResultAreaWire = OutlineWire<keyof TimeChartResultAreaNode>;

export function timeChartResultAreasWire(nodes: readonly OutlineNode[]) {
  return packOutline(
    nodes.filter((node) => node.type === "result_area" && !node.hidden),
    TIME_CHART_AREA_KEYS,
  );
}

// -- Notes: the linked-record picker -----------------------------------------------------

const NOTE_LINK_KEYS = ["id", "name", "type"] as const;
export type NoteLinkNode = Pick<OutlineNode, (typeof NOTE_LINK_KEYS)[number]>;
export type NoteLinkWire = OutlineWire<keyof NoteLinkNode>;

/** Every row: the picker offers every node, hidden or not, in outline order. */
export function noteLinkTargetsWire(nodes: readonly OutlineNode[]) {
  return packOutline(nodes, NOTE_LINK_KEYS);
}

// -- Detail drawer: the record the wish list opens ---------------------------------------

/**
 * What `NodeDetailDrawer` reads off the row it is opened on — its heading, and the rollups
 * and counts the task and project forms show — plus `category`, which feeds the category
 * options (`categoryOptions` reads `type` and `category` of every result area).
 */
const DETAIL_NODE_KEYS = [
  "id",
  "name",
  "type",
  "isDream",
  "category",
  "childCount",
  "hasChildren",
  "effortRollupMinutes",
  "effortLeftRollupMinutes",
  "actualEffortRollupMinutes",
  "percentCompleteRollup",
] as const;
export type DetailNode = Pick<OutlineNode, (typeof DETAIL_NODE_KEYS)[number]>;
export type DetailWire = OutlineWire<keyof DetailNode>;

/**
 * The Wish List's outline: every result area (the category options and the group headers)
 * and every node a wish belongs to (the owner the drawer opens on).
 */
export function wishOwnersWire(
  nodes: readonly OutlineNode[],
  wishNodeIds: Iterable<string>,
) {
  const owners = new Set(wishNodeIds);
  return packOutline(
    nodes.filter((node) => node.type === "result_area" || owners.has(node.id)),
    DETAIL_NODE_KEYS,
  );
}

// -- Schedule (Calendar and Agenda) ------------------------------------------------------

/**
 * The project rail, the agenda's project names, the appointment form's project list and
 * `owningProjectId`'s walk up the parent chain.
 *
 * Every row stays: the walk passes through tasks and goals on its way to a project, and
 * dropping a link would end it early. Only the columns shrink.
 */
const SCHEDULE_NODE_KEYS = [
  "id",
  "parentId",
  "type",
  "name",
  "state",
  "hidden",
  "lapLetter",
  "lapRank",
  "resultAreaName",
  "effortMinutes",
  "effortLeftMinutes",
] as const;
export type ScheduleNode = Pick<OutlineNode, (typeof SCHEDULE_NODE_KEYS)[number]>;
export type ScheduleWire = OutlineWire<keyof ScheduleNode>;

export function scheduleNodesWire(nodes: readonly OutlineNode[]) {
  return packOutline(nodes, SCHEDULE_NODE_KEYS);
}
