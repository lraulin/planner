import type { PriorityLetter } from "@/db/schema";

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
  metricType: string;
  /** Objective target as a number when set. */
  objectiveTarget: number | null;
  sortKey: string;
  /** Latest entry value by date. */
  lastValue: number | null;
  /** `YYYY-MM-DD` of the latest entry. */
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
  metricType: string;
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
  metricType?: string;
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
