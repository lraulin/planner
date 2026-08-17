/**
 * Disambiguate commands when two grids share one menu bar.
 *
 * Command ids are unique across the merged catalog (`registry.ts`). Two toolbars
 * both publishing `view.filter` is last-wins, which is how a dual-grid page
 * silently filters only the grid that mounted second. A scope makes the id and
 * the label name the grid they act on.
 */

import type { Command } from "./registry";

export type CommandScope = {
  /** Stable suffix on command ids (`bills`, `spend`). */
  id: string;
  /** Shown in menu labels (`Subscriptions & bills`). */
  label: string;
};

export function scopedCommandId(id: string, scope: CommandScope): string {
  return `${id}.${scope.id}`;
}

export function scopedFilterLabel(scope: CommandScope): string {
  return `Filter for ${scope.label}…`;
}

export function scopedClearFiltersLabel(scope: CommandScope): string {
  return `Clear filters for ${scope.label}`;
}

export function scopedFieldsLabel(scope: CommandScope): string {
  return `Show Fields for ${scope.label}`;
}

export function scopedResetLabel(scope: CommandScope): string {
  return `Reset ${scope.label}`;
}

/** Format-picker row: `CSV` → `CSV — Subscriptions & bills`. */
export function scopedFormatLabel(base: string, scope: CommandScope): string {
  return `${base} — ${scope.label}`;
}

export function scopeCommand(
  command: Command,
  scope: CommandScope,
  label: string,
): Command {
  return {
    ...command,
    id: scopedCommandId(command.id, scope),
    label,
    keywords: command.keywords ? `${command.keywords} ${scope.label}` : scope.label,
    alternate: command.alternate
      ? {
          ...command.alternate,
          label: scopedFormatLabel(command.alternate.label, scope),
        }
      : undefined,
  };
}
