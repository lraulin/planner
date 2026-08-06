import { asBoolean, asMap, asRecord } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * The app shell's own state. Stored under `shell`.
 *
 * It is here rather than in `localStorage` for a specific reason: the sidebar is the first thing
 * painted. Settings load server-side in `src/app/layout.tsx` precisely so a stored preference
 * arrives in the first HTML — a rail that renders expanded and then snaps shut on every navigation
 * is the most visible possible instance of the flash that decision exists to prevent.
 *
 * The Commands panel is in the same scope for the same reason, and because `navigation.md` says so:
 * "anything else the shell remembers goes in the same scope". It is one pane on the opposite edge
 * of the same frame, not a per-grid preference — a user who wants their commands visible wants them
 * visible on every module.
 */

export type ShellSettings = {
  sidebarCollapsed: boolean;
  commandsPanelOpen: boolean;
  /**
   * Which Commands panel sections the user has folded away, keyed by section label. Absent means
   * open, so a section this build has never heard of still renders — and a section that stops
   * existing leaves a dead key rather than a broken panel.
   */
  commandsPanelCollapsed: Record<string, boolean>;
};

/**
 * Sidebar expanded: the labels are the whole point until you have decided you know the icons.
 * Commands panel closed: the menu bar is the default surface and the panel is the opt-in for people
 * who want everything visible. Opening it for everyone would spend 208px of grid width on a
 * preference nobody expressed.
 */
export const DEFAULT_SHELL_SETTINGS: ShellSettings = {
  sidebarCollapsed: false,
  commandsPanelOpen: false,
  commandsPanelCollapsed: {},
};

export function parseShellSettings(value: unknown): ShellSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_SHELL_SETTINGS;

  return {
    sidebarCollapsed: asBoolean(
      record.sidebarCollapsed,
      DEFAULT_SHELL_SETTINGS.sidebarCollapsed,
    ),
    commandsPanelOpen: asBoolean(
      record.commandsPanelOpen,
      DEFAULT_SHELL_SETTINGS.commandsPanelOpen,
    ),
    commandsPanelCollapsed: asMap(record.commandsPanelCollapsed, (entry) =>
      typeof entry === "boolean" ? entry : null,
    ),
  };
}

export function serializeShellSettings(settings: ShellSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}
