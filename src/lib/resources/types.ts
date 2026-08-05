import type { ResourceCapacity, ResourceMinuteField } from "./capacity";

/** The complete Resource Information form payload. */
export type ResourceDetail = ResourceCapacity & {
  id: string;
  shortName: string;
  description: string;
  contactId: string | null;
  contactName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One Resources grid row. It is also rich enough for the weekly wizard's picker. */
export type ResourceListRow = ResourceDetail & {
  /** Nominal weekly working time, before overhead/effectiveness. */
  weeklyWorkingMinutes: number;
  /** Average-person capacity after the two AP adjustments. */
  weeklyAvailableMinutes: number;
};

/** Partial structured edit; omitted fields do not overwrite existing resource settings. */
export type ResourceInput = {
  shortName?: string;
  description?: string;
  contactId?: string | null;
  overheadPercent?: number;
  effectivenessPercent?: number;
} & Partial<Record<ResourceMinuteField, number>>;
