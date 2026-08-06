"use client";

import { KIND_LABELS, type NodeKind } from "@/lib/tree/hierarchy";
import type { Command } from "@/lib/commands/registry";
import {
  moreGridCommands,
  primaryGridCommands,
  type GridCommandCapabilities,
} from "@/lib/grid/commandDeck";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { ToolbarButton } from "@/components/tabs/tabChrome";

function accentFor(kind: NodeKind | undefined): string {
  switch (kind) {
    case "result_area":
      return "border-l-priority-a";
    case "goal":
      return "border-l-priority-b";
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

/** The compact, shared action row used by every grid that declares item capabilities. */
export function GridCommandDeck({
  commands,
  capabilities,
}: {
  commands: readonly Command[];
  capabilities?: GridCommandCapabilities;
}) {
  if (!capabilities) return null;

  const primary = primaryGridCommands(commands);
  const selected = capabilities.selection;
  const selectedLabel = selected?.label?.trim() || null;
  const count = selected?.count ?? (selected?.id ? 1 : 0);

  return (
    <div className="flex min-h-tap flex-none items-center gap-1 border-l-2 pl-2 md:min-h-0">
      <div className="flex flex-none items-center gap-1">
        {primary
          .filter((entry) => entry.toolbarGroup === "create")
          .map((entry) => (
            <DeckButton key={entry.id} command={entry} emphasis />
          ))}
      </div>

      {(selected || primary.some((entry) => entry.toolbarGroup === "selected")) && (
        <div
          className={`flex min-h-tap min-w-0 max-w-[15rem] items-center gap-1.5 border-l-2 px-1.5 md:min-h-0 ${accentFor(selected?.kind)}`}
          title={
            selectedLabel
              ? `${KIND_LABELS[selected?.kind ?? "task"]}: ${selectedLabel}`
              : "No row selected"
          }
        >
          {selected?.kind && (
            <TypeIcon kind={selected.kind} className="h-3.5 w-3.5 flex-none" />
          )}
          <span className="truncate text-[0.75rem] text-ink-muted">
            {selectedLabel ? (
              <>{count > 1 ? `${count} selected` : selectedLabel}</>
            ) : (
              "Nothing selected"
            )}
          </span>
        </div>
      )}

      <div className="flex flex-none items-center gap-1">
        {primary
          .filter(
            (entry) =>
              entry.toolbarGroup === "selected" || entry.toolbarGroup === "organize",
          )
          .map((entry) => (
            <DeckButton key={entry.id} command={entry} />
          ))}
      </div>
    </div>
  );
}

function DeckButton({
  command,
  emphasis = false,
}: {
  command: Command;
  emphasis?: boolean;
}) {
  return (
    <ToolbarButton
      onClick={command.run}
      disabled={command.disabled}
      title={command.title ?? command.shortcut}
    >
      <span className={emphasis ? "font-medium" : undefined}>{command.label}</span>
    </ToolbarButton>
  );
}

/** Kept as a named adapter for callers that want to show a command count in a custom surface. */
export { moreGridCommands };
