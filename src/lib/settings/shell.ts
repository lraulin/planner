import { asBoolean, asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * The app shell's own state. Stored under `shell`.
 *
 * One field today, and it is here rather than in `localStorage` for a specific reason: the
 * sidebar is the first thing painted. Settings load server-side in `src/app/layout.tsx`
 * precisely so a stored preference arrives in the first HTML — a rail that renders expanded
 * and then snaps shut on every navigation is the most visible possible instance of the
 * flash that decision exists to prevent.
 */

export type ShellSettings = {
  sidebarCollapsed: boolean;
};

/** Expanded: the labels are the whole point until you have decided you know the icons. */
export const DEFAULT_SHELL_SETTINGS: ShellSettings = {
  sidebarCollapsed: false,
};

export function parseShellSettings(value: unknown): ShellSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_SHELL_SETTINGS;

  return {
    sidebarCollapsed: asBoolean(
      record.sidebarCollapsed,
      DEFAULT_SHELL_SETTINGS.sidebarCollapsed,
    ),
  };
}

export function serializeShellSettings(settings: ShellSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}
