"use client";

import { OverflowMenu } from "@/components/shell/OverflowMenu";
import { TabToolbar } from "@/components/tabs/tabChrome";
import type { Command } from "@/lib/commands/registry";
import { CommandBar } from "./CommandBar";

const NO_COMMANDS: readonly Command[] = [];

/**
 * File + panel toggle + phone `⋯` for destinations that have no view commands of their own.
 *
 * Journal, Overview, the organizer, and any page whose grids hide their own command
 * row (Commitments) would otherwise have no menu bar — File would exist in `⌘K` and
 * nowhere you can see. They share this shell rather than each assembling a
 * `TabToolbar` with an empty `CommandBar`.
 */
export function DestinationCommandBar({
  commands = NO_COMMANDS,
  overflowLabel,
}: {
  commands?: readonly Command[];
  overflowLabel: string;
}) {
  return (
    <TabToolbar
      commandRow={<CommandBar commands={commands} />}
      pinned={<OverflowMenu label={overflowLabel} />}
    />
  );
}
