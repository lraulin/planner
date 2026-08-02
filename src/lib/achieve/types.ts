import type { NodeState, NodeType, PriorityLetter } from "@/db/schema";

/**
 * One row as read from an Achieve DataSet XML table — string field values only.
 * Missing elements are absent (not null), matching how AP omits defaults sometimes.
 */
export type AchRow = Record<string, string>;

/** Parsed Full XML / achxml document (schema stripped or ignored). */
export type AchDocument = {
  /** MajorDatabaseVersion from schema props when present. */
  majorDatabaseVersion: number | null;
  databaseVersion: number | null;
  /** Table name → rows in document order. */
  tables: Record<string, AchRow[]>;
};

/** Letter + optional rank, the way our outline stores priority. */
export type AchPriority = {
  letter: PriorityLetter | null;
  rank: number | null;
};

/**
 * A node ready to insert into our tree after GUID→uuid mapping and sortKey assignment.
 * `achId` is Achieve's original GUID so parent links can be resolved in a second pass.
 */
export type AchMappedNode = {
  achId: string;
  type: NodeType;
  /** Achieve parent GUID — result-area, project, or task parent as appropriate. */
  parentAchId: string | null;
  name: string;
  /** Sibling order from `__ORDINAL__` (or document order fallback). */
  ordinal: number;
  priority: AchPriority;
  tcPriority: AchPriority;
  state: NodeState;
  focus: boolean;
  collapsed: boolean;
  notes: string;
  deadline: Date | null;
  targetStart: Date | null;
  targetEnd: Date | null;
  deferredDate: Date | null;
  completedAt: Date | null;
  /** Task-ish fields; ignored for types that do not use them. */
  effortMinutes: number | null;
  effortLeftMinutes: number | null;
  actualEffortMinutes: number | null;
  percentComplete: number | null;
  description: string;
  place: string;
  purpose: string;
  /** Result-area only: 0–100 importance when present. */
  importance: number | null;
  /** Achieve category name for a result area, when we resolved it. */
  categoryName: string | null;
};

export type AchOutlineMap = {
  nodes: AchMappedNode[];
  /** Tables present in the file but not mapped in this pass. */
  skippedTables: string[];
  /** Counts by type after mapping. */
  counts: Record<NodeType, number>;
  warnings: string[];
};
