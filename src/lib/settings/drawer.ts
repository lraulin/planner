import { nodeTypeEnum, type NodeType } from "@/db/schema";
import { asMap, asRecord, asString } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * Which form tab was last open in the detail drawer, keyed by node type. Stored under
 * `drawer`.
 *
 * Per type rather than one global tab: a user who leaves Goals on Progress should still
 * land on General for a Task, and the two form tab sets are not the same.
 */

const ALL_TYPES = nodeTypeEnum.enumValues;

export type DrawerSettings = {
  tabByType: Partial<Record<NodeType, string>>;
};

export const DEFAULT_DRAWER_SETTINGS: DrawerSettings = {
  tabByType: {},
};

export function parseDrawerSettings(value: unknown): DrawerSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_DRAWER_SETTINGS;

  const known = new Set<string>(ALL_TYPES);
  const tabByType = asMap(record.tabByType, (entry) => {
    const tab = asString(entry, "");
    return tab === "" ? null : tab;
  });

  // Drop keys that are not node types — a renamed type or a hand-edited blob should not
  // pin a tab that no form will ever select.
  const cleaned: Partial<Record<NodeType, string>> = {};
  for (const [key, tab] of Object.entries(tabByType)) {
    if (known.has(key)) cleaned[key as NodeType] = tab;
  }

  return { tabByType: cleaned };
}

export function serializeDrawerSettings(settings: DrawerSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}
