import type { Command } from "@/lib/commands/registry";
import { KIND_LABELS, type NodeKind } from "@/lib/tree/hierarchy";

export type CreateMode = "top" | "before" | "after" | "child";

export type GridSelectionCapability = {
  id: string | null;
  count?: number;
  label?: string | null;
  kind?: NodeKind;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canIndent?: boolean;
  canOutdent?: boolean;
  canExpand?: boolean;
  canCollapse?: boolean;
};

export type GridCommandActions = {
  onCreate?: (kind: NodeKind, mode: CreateMode) => void;
  onOpen?: (id: string) => void;
  onRename?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopyAsText?: () => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onIndent?: (id: string) => void;
  onOutdent?: (id: string) => void;
  onExpand?: (id: string) => void;
  onCollapse?: (id: string) => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onExpandThroughLevel?: (level: number) => void;
  onChooseExpandThroughLevel?: () => void;
  onRemovePriorityGaps?: () => void;
  onReprioritizeUnique?: (id: string) => void;
  onConvert?: (id: string, kind: NodeKind) => void;
  onZoomIn?: (id: string) => void;
  onZoomOut?: () => void;
  onClearZoom?: () => void;
  onZoomToItem?: () => void;
};

export type GridPageCommand = Omit<Command, "group" | "toolbarGroup"> & {
  group?: Command["group"];
  toolbarGroup?: Command["toolbarGroup"];
};

export type GridCommandCapabilities = {
  createKinds?: readonly NodeKind[];
  hierarchy?: boolean;
  priorityMaintenance?: boolean;
  conversionKinds?: readonly NodeKind[];
  outlineZoom?: boolean;
  selection?: GridSelectionCapability;
  actions: GridCommandActions;
  pageCommands?: readonly GridPageCommand[];
};

const SELECT_REASON = "Select a row first";

function selected(capabilities: GridCommandCapabilities) {
  return capabilities.selection?.id ?? null;
}

function command(entry: Omit<Command, "run"> & { run?: () => void }): Command {
  return { ...entry, run: entry.run ?? (() => {}) };
}

/**
 * Build the contextual command list once. The same result feeds the deck, palette, overflow,
 * and row-menu adapters; a command that is unavailable is retained with a reason instead of
 * disappearing from the user's vocabulary.
 */
export function buildGridCommands(capabilities: GridCommandCapabilities): Command[] {
  const { actions, selection } = capabilities;
  const id = selected(capabilities);
  const hasSelection = id !== null;
  const selectionTitle = hasSelection ? undefined : SELECT_REASON;
  const kinds = capabilities.createKinds ?? [];
  const defaultKind = kinds[0];
  const out: Command[] = [];

  if (actions.onCreate && defaultKind) {
    out.push(
      command({
        id: "grid.create",
        label: "New",
        group: "record",
        toolbarGroup: "create",
        primary: true,
        keywords: "add item capture",
        run: () => actions.onCreate?.(defaultKind, "top"),
      }),
    );

    for (const kind of kinds) {
      const label = `New ${KIND_LABELS[kind].toLowerCase()}`;
      out.push(
        command({
          id: `grid.create.${kind}`,
          label,
          group: "record",
          toolbarGroup: "create",
          keywords: "add insert",
          run: () => actions.onCreate?.(kind, "top"),
        }),
      );
    }

    if (capabilities.hierarchy) {
      for (const [mode, preposition] of [
        ["before", "before"],
        ["after", "after"],
        ["child", "as child"],
      ] as const) {
        out.push(
          command({
            id: `grid.create.${mode}`,
            label: `New ${preposition === "as child" ? "child" : `item ${preposition}`}`,
            group: "record",
            toolbarGroup: "create",
            shortcut:
              mode === "before" ? "⇧Insert" : mode === "child" ? "⌃Insert" : "Insert",
            disabled: !hasSelection,
            title: selectionTitle,
            run: () => {
              if (defaultKind) actions.onCreate?.(defaultKind, mode);
            },
          }),
        );
      }
    }
  }

  if (actions.onOpen) {
    out.push(
      command({
        id: "record.open",
        label: "Open",
        group: "record",
        toolbarGroup: "selected",
        primary: true,
        shortcut: "⏎",
        disabled: !hasSelection,
        title: selectionTitle,
        run: () => id && actions.onOpen?.(id),
      }),
    );
  }
  if (actions.onRename) {
    out.push(
      command({
        id: "record.rename",
        label: "Rename",
        group: "record",
        toolbarGroup: "selected",
        primary: true,
        shortcut: "F2",
        disabled: !hasSelection,
        title: selectionTitle,
        run: () => id && actions.onRename?.(id),
      }),
    );
  }
  if (actions.onCopyAsText) {
    out.push(
      command({
        id: "record.copy-as-text",
        label:
          selection?.count && selection.count > 1
            ? `Copy as text (${selection.count})`
            : "Copy as text",
        group: "record",
        toolbarGroup: "more",
        shortcut: "⌘C",
        disabled: !hasSelection,
        title: selectionTitle,
        run: actions.onCopyAsText,
      }),
    );
  }
  if (actions.onDelete) {
    out.push(
      command({
        id: "record.delete",
        label: "Delete",
        group: "record",
        toolbarGroup: "more",
        shortcut: "Delete",
        destructive: true,
        disabled: !hasSelection,
        title: selectionTitle,
        run: () => id && actions.onDelete?.(id),
      }),
    );
  }

  if (capabilities.hierarchy) {
    const movement: [
      string,
      string,
      keyof GridCommandActions,
      keyof GridSelectionCapability,
      string,
    ][] = [
      ["record.move-up", "Move up", "onMoveUp", "canMoveUp", "⌥↑"],
      ["record.move-down", "Move down", "onMoveDown", "canMoveDown", "⌥↓"],
      ["record.indent", "Indent", "onIndent", "canIndent", "Tab"],
      ["record.outdent", "Outdent", "onOutdent", "canOutdent", "⇧Tab"],
    ];
    for (const [commandId, label, actionKey, capabilityKey, shortcut] of movement) {
      const action = actions[actionKey] as ((nodeId: string) => void) | undefined;
      if (!action) continue;
      const legal = selection?.[capabilityKey];
      out.push(
        command({
          id: commandId,
          label,
          group: "record",
          toolbarGroup: "organize",
          primary: true,
          shortcut,
          disabled: !hasSelection || legal === false,
          title: !hasSelection
            ? SELECT_REASON
            : legal === false
              ? `Cannot ${label.toLowerCase()} this row`
              : undefined,
          run: () => id && action(id),
        }),
      );
    }

    if (actions.onExpand || actions.onCollapse) {
      // Both flags describe what is *possible*, not what the row currently is: a row that
      // can expand is collapsed. The command has to offer the verb that would change the
      // row, so it follows `canExpand` rather than the row's state.
      const canExpand = selection?.canExpand === true;
      const canCollapse = selection?.canCollapse === true;
      out.push(
        command({
          id: "record.expand-collapse",
          label: canExpand ? "Expand selected" : "Collapse selected",
          group: "record",
          toolbarGroup: "more",
          shortcut: canExpand ? "→" : "←",
          disabled: !hasSelection || (!canExpand && !canCollapse),
          title: !hasSelection
            ? SELECT_REASON
            : !canExpand && !canCollapse
              ? "Selected row has no children"
              : undefined,
          run: () => {
            if (!id) return;
            if (canExpand) actions.onExpand?.(id);
            else actions.onCollapse?.(id);
          },
        }),
      );
    }
    if (actions.onExpandAll) {
      out.push(
        command({
          id: "view.expand-all-items",
          label: "Expand all items",
          group: "view",
          toolbarGroup: "organize",
          primary: true,
          run: actions.onExpandAll,
        }),
      );
    }
    if (actions.onCollapseAll) {
      out.push(
        command({
          id: "view.collapse-all-items",
          label: "Collapse all items",
          group: "view",
          toolbarGroup: "more",
          run: actions.onCollapseAll,
        }),
      );
    }
    if (actions.onChooseExpandThroughLevel) {
      out.push({
        id: "view.expand-through-level",
        label: "Expand through level…",
        group: "view",
        toolbarGroup: "more",
        run: actions.onChooseExpandThroughLevel,
      });
    } else if (actions.onExpandThroughLevel) {
      for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        out.push(
          command({
            id: `view.expand-through-${level}`,
            label: `Expand through level ${level}`,
            group: "view",
            toolbarGroup: "more",
            run: () => actions.onExpandThroughLevel?.(level),
          }),
        );
      }
    }
  }

  if (capabilities.priorityMaintenance) {
    if (actions.onRemovePriorityGaps) {
      out.push(
        command({
          id: "record.remove-priority-gaps",
          label: "Remove priority gaps",
          group: "record",
          toolbarGroup: "more",
          keywords: "dense ranks renumber priority",
          run: actions.onRemovePriorityGaps,
        }),
      );
    }
    if (actions.onReprioritizeUnique) {
      out.push(
        command({
          id: "record.reprioritize-unique",
          label: "Reprioritize unique",
          group: "record",
          toolbarGroup: "more",
          disabled: !hasSelection,
          title: selectionTitle,
          run: () => id && actions.onReprioritizeUnique?.(id),
        }),
      );
    }
  }

  if (capabilities.conversionKinds && actions.onConvert) {
    for (const kind of capabilities.conversionKinds) {
      out.push(
        command({
          id: `record.convert.${kind}`,
          label: `Convert to ${KIND_LABELS[kind]}`,
          group: "record",
          toolbarGroup: "more",
          disabled: !hasSelection,
          title: selectionTitle,
          run: () => id && actions.onConvert?.(id, kind),
        }),
      );
    }
  }

  if (capabilities.outlineZoom) {
    if (actions.onZoomIn) {
      out.push(
        command({
          id: "outline.zoom-in",
          label: "Zoom in to selected item",
          group: "view",
          toolbarGroup: "more",
          disabled: !hasSelection,
          title: selectionTitle,
          run: () => id && actions.onZoomIn?.(id),
        }),
      );
    }
    if (actions.onZoomOut) {
      out.push({
        id: "outline.zoom-out",
        label: "Zoom out one level",
        group: "view",
        toolbarGroup: "more",
        run: actions.onZoomOut,
      });
    }
    if (actions.onClearZoom) {
      out.push({
        id: "outline.zoom-clear",
        label: "Clear zoom",
        group: "view",
        toolbarGroup: "more",
        run: actions.onClearZoom,
      });
    }
    if (actions.onZoomToItem) {
      out.push({
        id: "outline.zoom-to-item",
        label: "Zoom to item…",
        group: "view",
        toolbarGroup: "more",
        run: actions.onZoomToItem,
      });
    }
  }

  return [...out, ...(capabilities.pageCommands ?? [])].map((entry) => ({
    ...entry,
    group: entry.group ?? "record",
    hasOwnControl: entry.primary === true ? true : entry.hasOwnControl,
  }));
}

export function primaryGridCommands(commands: readonly Command[]): Command[] {
  return commands.filter(
    (entry) => entry.primary === true && entry.toolbarGroup !== "more",
  );
}

export function moreGridCommands(commands: readonly Command[]): Command[] {
  return commands.filter((entry) => !entry.primary && entry.toolbarGroup !== "create");
}
