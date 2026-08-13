"use client";

import { useMemo } from "react";
import { KIND_LABELS, type NodeKind } from "@/lib/tree/hierarchy";
import { formatBindings } from "@/lib/commands/bindings";
import { toolbarSegments } from "@/lib/commands/menus";
import type { Command } from "@/lib/commands/registry";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { CommandGlyph } from "@/components/icons/commandIcons";
import { useCommands, useRegisterCommands } from "@/components/shell/CommandProvider";
import { openCommandPalette } from "@/components/shell/commandEvent";
import { useFileCommands } from "@/components/shell/globalCommands";
import { useCommandsPanel } from "@/components/shell/useShellSettings";
import { OPEN_PALETTE } from "@/lib/commands/chords";
import { ToolbarDivider, ToolbarIconButton } from "@/components/tabs/tabChrome";
import { CommandMenuBar } from "./CommandMenuBar";
import type { GridSelectionCapability } from "@/lib/grid/commandDeck";

/**
 * The type accent on the selection chip — the one visual risk this surface spends, kept from the
 * frozen command-deck slice. A selected Result Area and a selected Task should not look identical
 * in a bar that is about to act on one of them.
 */
function accentFor(kind: NodeKind | undefined): string {
  switch (kind) {
    case "result_area":
      return "border-l-priority-a";
    case "goal":
    case "dream":
      return "border-l-priority-b";
    case "project":
      return "border-l-priority-c";
    case "task":
      return "border-l-priority-d";
    default:
      return "border-l-rule";
  }
}

/**
 * Row 1: the verbs.
 *
 * `File ▾ New ▾ Item ▾ Organize ▾ View ▾ │ ⊕ │ ⤒ ⤓ ⤷ │ ↑ ↓ │ → ← │ ⏎ ✎ │ ☑ Write brief`
 *
 * Three things, left to right: the **menu bar** (everything this view can do, named and
 * sectioned), the **icon segments** (the handful you reach for every session, grouped by weight
 * decade so a hairline lands between clusters), and the **selection chip** (what the verbs are
 * about to act on).
 *
 * Desktop only — `TabToolbar` hides this row below `md`, where `⋯` renders the same tree.
 */
export function CommandBar({
  commands,
  selection,
}: {
  commands: readonly Command[];
  selection?: GridSelectionCapability;
}) {
  const { open: panelOpen, setOpen: setPanelOpen } = useCommandsPanel();
  const fileCommands = useFileCommands();
  const registered = useCommands();
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
  // Registered here, not by each host, so a view that draws this bar and never a GridToolbar
  // (Schedule calendar, Fitness, Day) still has View ▸ Show commands panel. One source is
  // also what stops a grid and a host from both listing it.
  const panelCommands = useMemo(
    () => [paletteCommand, panelCommand],
    [paletteCommand, panelCommand],
  );
  useRegisterCommands(panelCommands);

  // The named menus cannot read the registry alone: registration is a setState, so
  // File, the host's commands, Command palette, and the panel toggle have to sit
  // here this render. `registered` is merged after so a sibling like ViewPicker —
  // which publishes Save / Save as on its own — still lands in View, not only in
  // ⌘K and the panel.
  const menuCommands = useMemo(() => {
    const byId = new Map<string, Command>();
    for (const command of [
      ...fileCommands,
      ...commands,
      ...registered,
      paletteCommand,
      panelCommand,
    ]) {
      byId.set(command.id, command);
    }
    return [...byId.values()];
  }, [fileCommands, commands, registered, paletteCommand, panelCommand]);

  const segments = toolbarSegments(commands);

  return (
    <>
      <CommandMenuBar commands={menuCommands} />

      {segments.map((segment, index) => (
        <div key={index} className="flex flex-none items-center">
          {/* Between segments, and between the menu bar and the first one. */}
          <ToolbarDivider />
          {segment.map((command) => (
            <ToolbarIconButton
              key={command.id}
              icon={command.icon}
              label={command.label}
              disabled={command.disabled}
              onClick={command.run}
              // The tooltip carries the label *and* the shortcut, because the glyph carries
              // neither. When the command is unavailable, `title` is the reason instead — that is
              // the more useful sentence, and it is the one `navigation.md` asks for.
              title={command.title ?? shortcutTitle(command)}
            />
          ))}
        </div>
      ))}

      <SelectionChip selection={selection} />

      <div className="ml-auto flex flex-none items-center">
        <CommandsPanelToggle
          open={panelOpen}
          onToggle={() => setPanelOpen(!panelOpen)}
        />
      </div>
    </>
  );
}

/**
 * The Commands panel toggle, pinned to the right of the command row.
 *
 * Pressed-state fill rather than a label change, matching the sidebar's own collapse toggle
 * and the Density segments: the control says what it is doing, so it does not need a word
 * explaining that it is about panels. The command in `View ▸ Panels` carries the sentence.
 */
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

function shortcutTitle(command: Command): string {
  const shortcut = formatBindings(command.bindings);
  return shortcut ? `${command.label} (${shortcut})` : command.label;
}

/**
 * What the verbs are about to act on.
 *
 * Pushed to the right of the segments and given the type accent rather than a border: it is
 * *context*, not a control, and it must not read as another button. Absent entirely on a grid that
 * declared no selection — a chip permanently saying "Nothing selected" on a grid where nothing can
 * be selected is furniture.
 */
function SelectionChip({ selection }: { selection?: GridSelectionCapability }) {
  if (!selection) return null;

  const label = selection.label?.trim() || null;
  const count = selection.count ?? (selection.id ? 1 : 0);

  return (
    <div
      className={`ml-2 flex min-w-0 max-w-[18rem] flex-none items-center gap-1.5 border-l-2 pl-2 ${accentFor(selection.kind)}`}
      title={
        label ? `${KIND_LABELS[selection.kind ?? "task"]}: ${label}` : "No row selected"
      }
    >
      {selection.kind && label && (
        <TypeIcon kind={selection.kind} className="h-3.5 w-3.5 flex-none" />
      )}
      <span className="truncate text-[0.75rem] text-ink-muted">
        {label ? (count > 1 ? `${count} selected` : label) : "Nothing selected"}
      </span>
    </div>
  );
}
