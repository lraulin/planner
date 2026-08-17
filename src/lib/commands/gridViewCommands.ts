/**
 * View ▸ Layout commands that open or clear a grid's filters.
 *
 * One grid publishes unscoped ids (`view.filter`). Two grids share a page: the
 * catalog carries a focused shortcut plus explicit `… for [name]` rows
 * (`navigation.md`). `scopeCommand` stamps the per-grid copies.
 */

import type { Command } from "./registry";
import {
  scopeCommand,
  scopedClearFiltersLabel,
  scopedFieldsLabel,
  scopedFilterLabel,
  scopedResetLabel,
  type CommandScope,
} from "./scope";

export type GridViewActions = {
  openFilter: () => void;
  clearFilters: () => void;
  openFields: () => void;
  reset: () => void;
  filtersActive: boolean;
  resetTitle: string;
};

/** Sentence, not a boolean — `navigation.md`: unavailable names the specific reason. */
export function clearFiltersRefusal(
  active: boolean,
  gridLabel?: string,
): string | null {
  if (active) return null;
  return gridLabel ? `No filters on ${gridLabel}` : "No filters on this grid";
}

export function gridViewLayoutCommands(
  actions: GridViewActions,
  scope?: CommandScope,
): Command[] {
  const refusal = clearFiltersRefusal(actions.filtersActive, scope?.label);
  const filter: Command = {
    id: "view.filter",
    label: "Filter…",
    group: "view",
    menu: "view",
    section: "Layout",
    icon: "filter",
    keywords: "advanced condition where",
    ownControl: true,
    run: actions.openFilter,
  };
  const clear: Command = {
    id: "view.clear-filters",
    label: "Clear filters",
    group: "view",
    menu: "view",
    section: "Layout",
    icon: "filter",
    keywords: "reset remove narrowing search",
    disabled: !actions.filtersActive,
    title: refusal ?? "Clear column filters, the advanced filter and search",
    run: actions.clearFilters,
  };
  const fields: Command = {
    id: "view.fields",
    label: "Show Fields",
    group: "view",
    menu: "view",
    section: "Layout",
    icon: "fields",
    keywords: "columns hide customize current view",
    run: actions.openFields,
  };
  const reset: Command = {
    id: "view.reset",
    label: "Reset this grid",
    group: "view",
    menu: "view",
    section: "Layout",
    icon: "reset",
    keywords: "clear default columns layout",
    title: actions.resetTitle,
    run: actions.reset,
  };

  if (!scope) return [filter, clear, fields, reset];

  return [
    scopeCommand(filter, scope, scopedFilterLabel(scope)),
    scopeCommand(clear, scope, scopedClearFiltersLabel(scope)),
    scopeCommand(fields, scope, scopedFieldsLabel(scope)),
    scopeCommand(reset, scope, scopedResetLabel(scope)),
  ];
}

/**
 * Compact dual-grid catalog: focused shortcut first, then each grid's explicit rows.
 */
export function dualGridViewCommands(
  focused: GridViewActions & { label: string },
  grids: readonly (GridViewActions & { scope: CommandScope })[],
): Command[] {
  const focusedCommands = gridViewLayoutCommands(focused).map((command) => {
    if (command.id === "view.filter") {
      return { ...command, title: `Filter the ${focused.label} grid` };
    }
    if (command.id === "view.fields") {
      return { ...command, title: `Show Fields on ${focused.label}` };
    }
    if (command.id === "view.reset") {
      return { ...command, title: `Reset ${focused.label}` };
    }
    if (command.id === "view.clear-filters") {
      const refusal = clearFiltersRefusal(focused.filtersActive, focused.label);
      return {
        ...command,
        title: refusal ?? `Clear filters on ${focused.label}`,
      };
    }
    return command;
  });
  return [
    ...focusedCommands,
    ...grids.flatMap((grid) => gridViewLayoutCommands(grid, grid.scope)),
  ];
}
