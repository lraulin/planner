"use client";

import { KIND_LABELS, type NodeKind } from "@/lib/tree/hierarchy";
import { formatBindings } from "@/lib/commands/bindings";
import { toolbarSegments } from "@/lib/commands/menus";
import type { Command } from "@/lib/commands/registry";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { ToolbarDivider, ToolbarIconButton } from "@/components/tabs/tabChrome";
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

export function hasVerbRow(
  commands: readonly Command[],
  selection?: GridSelectionCapability,
): boolean {
  return toolbarSegments(commands).length > 0 || Boolean(selection);
}

/**
 * The page verb row: icon segments and the selection chip.
 *
 * Named menus live in the shell (`ApplicationMenu`), above the page bar. This row is the
 * high-frequency subset that sits with the grid. Desktop only — `TabToolbar` hides it
 * below `md`, where `⋯` on the shell is the catalog.
 *
 * Returns `null` when there is nothing to draw, so a page with no promoted icons does not
 * keep an empty strip under the application menu.
 */
export function CommandBar({
  commands,
  selection,
}: {
  commands: readonly Command[];
  selection?: GridSelectionCapability;
}) {
  const segments = toolbarSegments(commands);
  if (segments.length === 0 && !selection) return null;

  return (
    <>
      {segments.map((segment, index) => (
        <div key={index} className="flex flex-none items-center">
          {index > 0 && <ToolbarDivider />}
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
    </>
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
