import type { PriorityLetter } from "@/db/schema";

/**
 * How entry values are interpreted for Last Value and the performance graph.
 * Matches Achieve Planner's metric Type (storage is always the number typed;
 * aggregation is read-time).
 */
export type MetricType = "instance" | "cumulative" | "total";

export const METRIC_TYPES: readonly MetricType[] = [
  "instance",
  "cumulative",
  "total",
] as const;

export const METRIC_TYPE_LABELS: Record<MetricType, string> = {
  instance: "Instance",
  cumulative: "Cumulative",
  total: "Total",
};

/** List row for the Metrics tab (and goal-scoped lists). */
export type MetricListRow = {
  id: string;
  ownerNodeId: string | null;
  ownerName: string | null;
  title: string;
  category: string;
  question: string;
  units: string;
  active: boolean;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  metricType: MetricType;
  /** Objective target as a number when set. */
  objectiveTarget: number | null;
  sortKey: string;
  /**
   * Displayed progress: latest entry for instance/total, sum of entries for
   * cumulative.
   */
  lastValue: number | null;
  /** `YYYY-MM-DD` of the latest entry (by date), when any. */
  lastDate: string | null;
};

export type MetricEntryView = {
  id: string;
  metricId: string;
  entryDate: string;
  entryType: string;
  target: number | null;
  value: number;
};

export type MetricDetail = {
  id: string;
  ownerNodeId: string | null;
  ownerName: string | null;
  title: string;
  category: string;
  question: string;
  description: string;
  reason: string;
  units: string;
  active: boolean;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  metricType: MetricType;
  objectiveTarget: number | null;
  sortKey: string;
  entries: MetricEntryView[];
  lastValue: number | null;
  lastDate: string | null;
};

export type MetricInput = {
  title?: string;
  category?: string;
  question?: string;
  description?: string;
  reason?: string;
  units?: string;
  active?: boolean;
  priorityLetter?: PriorityLetter | null;
  priorityRank?: number | null;
  metricType?: MetricType;
  /** Pass `null` to clear. */
  objectiveTarget?: number | null;
  /** Pass `null` to make standalone. */
  ownerNodeId?: string | null;
};

export type MetricEntryInput = {
  entryDate: string;
  entryType?: string;
  target?: number | null;
  value: number;
};

/** One point for the performance graph. */
export type MetricChartPoint = {
  date: string;
  value: number;
  target: number | null;
};
