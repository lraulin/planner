"use client";

import { useCallback, useMemo } from "react";
import { useSetting } from "@/components/settings/SettingsProvider";
import { parseShellSettings, serializeShellSettings } from "@/lib/settings/shell";
import { SHELL_SCOPE } from "@/lib/settings/scopes";

/**
 * The `shell` scope, read the one way.
 *
 * Module-level codec per `useSetting`'s contract — one rebuilt inline would re-parse the blob on
 * every render of every consumer. There are three consumers now (the sidebar, the Commands panel,
 * and the panel's toggle over on the command bar), which is one more than is safe to leave as three
 * copies of the same four lines.
 */
const SHELL_CODEC = {
  parse: parseShellSettings,
  serialize: serializeShellSettings,
};

export function useShellSettings() {
  return useSetting(SHELL_SCOPE, SHELL_CODEC);
}

/**
 * The Commands panel's open state, and the one way to flip it.
 *
 * **Every field here is identity-stable.** `GridToolbar` puts `setOpen` in the dependency list of
 * the memo it hands to `useRegisterCommands`, and that hook re-registers — which sets state on the
 * provider — whenever the array changes. A `setOpen` rebuilt on each render therefore rebuilds the
 * command list on each render, which re-registers on each render, and the two chase each other
 * until the tab locks up. That is not hypothetical: the first version of this hook returned bare
 * arrows and the churn guard fired on the very first page load.
 */
export function useCommandsPanel() {
  const { value, patch } = useShellSettings();

  const setOpen = useCallback(
    (open: boolean) => patch((current) => ({ ...current, commandsPanelOpen: open })),
    [patch],
  );

  const toggleSection = useCallback(
    (label: string) =>
      patch((current) => ({
        ...current,
        commandsPanelCollapsed: {
          ...current.commandsPanelCollapsed,
          [label]: !current.commandsPanelCollapsed[label],
        },
      })),
    [patch],
  );

  return useMemo(
    () => ({
      open: value.commandsPanelOpen,
      collapsed: value.commandsPanelCollapsed,
      setOpen,
      toggleSection,
    }),
    [value.commandsPanelOpen, value.commandsPanelCollapsed, setOpen, toggleSection],
  );
}
