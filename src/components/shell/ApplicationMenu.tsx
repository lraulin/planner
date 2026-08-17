"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { CommandMenuBar } from "@/components/grid/CommandMenuBar";
import { CommandGlyph } from "@/components/icons/commandIcons";
import { OPEN_PALETTE } from "@/lib/commands/chords";
import type { Command } from "@/lib/commands/registry";
import { isFocusedFlow } from "@/lib/navigation/pages";
import { openCommandPalette } from "./commandEvent";
import { useCommands, useRegisterCommands } from "./CommandProvider";
import { useFileCommands } from "./globalCommands";
import { useCommandsPanel } from "./useShellSettings";

/**
 * The application menu bar: File · New · Item · Organize · View · Tools.
 *
 * Drawn by the shell, above the page bar, from the command registry. Pages no longer
 * render named menus — they keep the icon row and the lens. File and View ▸ Command
 * palette / Show commands panel are registered here so Insights and Dashboard still
 * have a catalog when they never mount a CommandBar.
 */
export function ApplicationMenu() {
  const pathname = usePathname();
  if (isFocusedFlow(pathname)) return null;
  return <ApplicationMenuBar />;
}

function ApplicationMenuBar() {
  const fileCommands = useFileCommands();
  const registered = useCommands();
  const { open: panelOpen, setOpen: setPanelOpen } = useCommandsPanel();

  const paletteCommand = useMemo<Command>(
    () => ({
      id: "view.command-palette",
      label: "Command palette",
      group: "view",
      menu: "view",
      section: "Panels",
      icon: "go-to",
      bindings: OPEN_PALETTE,
      keywords: "search commands go fuzzy",
      title: "Search every command and destination",
      run: openCommandPalette,
    }),
    [],
  );
  const panelCommand = useMemo<Command>(
    () => ({
      id: "view.commands-panel",
      label: panelOpen ? "Hide commands panel" : "Show commands panel",
      group: "view",
      menu: "view",
      section: "Panels",
      icon: "panel",
      keywords: "pane sidebar actions palette command bar",
      title: "A pinned pane listing every command this view has, grouped",
      run: () => setPanelOpen(!panelOpen),
    }),
    [panelOpen, setPanelOpen],
  );
  const panelCommands = useMemo(
    () => [paletteCommand, panelCommand],
    [paletteCommand, panelCommand],
  );
  useRegisterCommands(panelCommands);

  const menuCommands = useMemo(() => {
    const byId = new Map<string, Command>();
    for (const command of [
      ...fileCommands,
      ...registered,
      paletteCommand,
      panelCommand,
    ]) {
      byId.set(command.id, command);
    }
    return [...byId.values()];
  }, [fileCommands, registered, paletteCommand, panelCommand]);

  return (
    <div className="hidden min-w-0 max-w-full items-center gap-2 border-b border-rule px-3 py-1.5 md:flex">
      <CommandMenuBar commands={menuCommands} />
      <div className="ml-auto flex flex-none items-center">
        <CommandsPanelToggle
          open={panelOpen}
          onToggle={() => setPanelOpen(!panelOpen)}
        />
      </div>
    </div>
  );
}

function CommandsPanelToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={onToggle}
      title={open ? "Hide the commands panel" : "Show the commands panel"}
      aria-label={open ? "Hide the commands panel" : "Show the commands panel"}
      className={`flex h-7 w-7 flex-none items-center justify-center rounded transition-colors ${
        open
          ? "bg-select text-ink"
          : "text-ink-faint hover:bg-surface-raised hover:text-ink"
      }`}
    >
      <CommandGlyph icon="panel" />
    </button>
  );
}
