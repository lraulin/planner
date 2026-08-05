"use client";

import { useRef, useState } from "react";
import { ContextMenu, type MenuItem } from "@/components/grid/ContextMenu";
import { mergeCommands, overflowCommands } from "@/lib/commands/registry";
import { MoreIcon } from "./navIcons";
import { useCommands } from "./CommandProvider";

/**
 * `⋯` — the visible half of the command registry.
 *
 * The palette is the fast path and this is the discoverable one. `ux-principles.md` rules
 * out a command reachable only by a shortcut ("a gesture nobody can see is not a
 * discoverable action"), and there is no `⌘K` on a phone at all, so a palette without this
 * button would be a command surface that does not exist on touch.
 *
 * It renders through the grid's existing `ContextMenu`, which already solves the whole
 * problem — arrow / Home / End navigation skipping separators and disabled rows, the
 * right-aligned shortcut column, measuring then flipping upward near the bottom edge, and
 * closing on scroll without closing on the scroll it causes itself.
 *
 * It shows only what the current view registered, minus anything already carrying its own
 * toolbar button (`overflowCommands`). Never the global commands either — the palette and the
 * sidebar cover those, and a `⋯` reprinting "Settings" and "Sign out" on every toolbar would
 * be the permanent chrome this whole change exists to remove.
 */
export function OverflowMenu({ label = "More commands" }: { label?: string }) {
  // Merged before filtering so the menu is ordered by group, exactly as the palette is.
  // Raw registration order is effect order, which is child-before-parent — it put the
  // Tasks grid's `Copy as text` above `Show Fields` on one tab and would not have on
  // another. A menu whose entries move between views is a menu you have to read every time.
  const commands = overflowCommands(mergeCommands(useCommands()));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  // Nothing registered means nothing to open. Rendering a button whose menu is empty is
  // worse than rendering no button — it reads as broken rather than as absent.
  if (commands.length === 0) return null;

  const items: MenuItem[] = commands.flatMap((command, index) => {
    const item: MenuItem = {
      label: command.label,
      shortcut: command.shortcut,
      title: command.title,
      disabled: command.disabled,
      destructive: command.destructive,
      onSelect: command.run,
    };

    // A rule between groups, matching the palette's headings without spending a row on one.
    const previous = commands[index - 1];
    return previous && previous.group !== command.group
      ? (["separator", item] as MenuItem[])
      : [item];
  });

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          // Anchored to the button's bottom-left rather than the pointer: this is a menu
          // button, not a right-click, and it must land in the same place under a tap.
          setAt(rect ? { x: rect.left, y: rect.bottom + 2 } : { x: 0, y: 0 });
        }}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        aria-label={label}
        title={label}
        // 44 × 44 below `md`, both axes — `responsive.md` is explicit that hit-target size is
        // not covered by the accessibility exemption, and this is the phone's only way to
        // reach a view's commands.
        className="flex min-h-tap min-w-tap flex-none items-center justify-center rounded border border-rule text-ink-muted transition-colors hover:border-rule-strong hover:bg-surface-raised hover:text-ink md:min-h-0 md:min-w-0 md:px-2 md:py-1"
      >
        <MoreIcon />
      </button>

      {at && (
        <ContextMenu x={at.x} y={at.y} items={items} onClose={() => setAt(null)} />
      )}
    </>
  );
}
