import type { Command } from "@/lib/commands/registry";
import type { KeyBinding } from "@/lib/commands/bindings";
import { commandOrder } from "@/lib/commands/menus";
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
  /**
   * Why the movement commands are unavailable, when the grid knows something better than "this row
   * cannot move". The Notes grid does: its moves need manual order in nested mode, and
   * "Cannot indent this row" would send you looking at the row instead of at the Sort control.
   */
  moveReason?: string;
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

export type GridPageCommand = Omit<Command, "group"> & { group?: Command["group"] };

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

/**
 * Toolbar weights, and therefore the command row's segments — the decade is the segment
 * (`toolbarSegments`). Named rather than sprinkled as literals so the reading order of the row is
 * legible in one place: create, insert, move, indent, then the item verbs.
 */
const TOOLBAR = {
  create: 10,
  insertBefore: 20,
  insertAfter: 21,
  insertChild: 22,
  moveUp: 30,
  moveDown: 31,
  indent: 40,
  outdent: 41,
  open: 50,
  rename: 51,
} as const;

/**
 * Achieve's bindings. `Insert` is paired with `⌘⏎` throughout because Apple keyboards have no
 * Insert key — the first binding in each list is the one printed, which keeps the labels the app
 * has always shown while the second one is what actually gets used on this hardware.
 */
const INSERT_BEFORE: KeyBinding[] = [
  { key: "Insert", shift: true },
  { key: "Enter", meta: true, shift: true },
];
const INSERT_AFTER: KeyBinding[] = [{ key: "Insert" }, { key: "Enter", meta: true }];
const INSERT_CHILD: KeyBinding[] = [
  { key: "Insert", ctrl: true },
  { key: "Enter", meta: true, ctrl: true },
];

function selected(capabilities: GridCommandCapabilities) {
  return capabilities.selection?.id ?? null;
}

function command(entry: Omit<Command, "run"> & { run?: () => void }): Command {
  return { ...entry, run: entry.run ?? (() => {}) };
}

/**
 * Build the contextual command list once. The same result feeds the menu bar, the icon row, the
 * Commands panel, the row menu, the `⋯` sheet and the palette; a command that is unavailable is
 * retained with a reason instead of disappearing from the user's vocabulary.
 *
 * Every command here declares where it lands — `menu`, `section`, `icon`, and optionally `toolbar`
 * and `rowMenu` — so placement is a property of the command rather than a filter applied by
 * whichever surface is rendering. That is the whole reason the surfaces cannot disagree.
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
        menu: "new",
        section: "New",
        icon: "new",
        // The one-click default. Choosing a *kind* is what the New menu is for, so this button
        // and that menu are a default action and its variants rather than two ways to do one
        // thing.
        toolbar: TOOLBAR.create,
        // The one command on the row menu that does not need a row, which is what makes the
        // blank-area menu worth opening: right-clicking below the last row of an empty grid
        // otherwise offers nothing but greyed item verbs. Achieve's blank menu had live
        // creation on it for the same reason.
        rowMenu: true,
        keywords: "add item capture",
        run: () => actions.onCreate?.(defaultKind, "top"),
      }),
    );

    for (const kind of kinds) {
      out.push(
        command({
          id: `grid.create.${kind}`,
          label: `New ${KIND_LABELS[kind].toLowerCase()}`,
          group: "record",
          menu: "new",
          section: "New",
          icon: "new",
          keywords: "add insert",
          run: () => actions.onCreate?.(kind, "top"),
        }),
      );
    }

    if (capabilities.hierarchy) {
      const inserts: [CreateMode, string, Command["icon"], number, KeyBinding[]][] = [
        [
          "before",
          "New item before",
          "insert-before",
          TOOLBAR.insertBefore,
          INSERT_BEFORE,
        ],
        ["after", "New item after", "insert-after", TOOLBAR.insertAfter, INSERT_AFTER],
        ["child", "New child", "insert-child", TOOLBAR.insertChild, INSERT_CHILD],
      ];

      for (const [mode, label, icon, toolbar, bindings] of inserts) {
        out.push(
          command({
            id: `grid.create.${mode}`,
            label,
            group: "record",
            menu: "new",
            section: "Insert row",
            icon,
            toolbar,
            rowMenu: true,
            bindings,
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
        menu: "item",
        section: "Item",
        icon: "open",
        toolbar: TOOLBAR.open,
        rowMenu: true,
        bindings: [{ key: "Enter" }],
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
        menu: "item",
        section: "Item",
        icon: "rename",
        toolbar: TOOLBAR.rename,
        rowMenu: true,
        bindings: [{ key: "F2" }],
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
        menu: "item",
        section: "Item",
        icon: "copy",
        rowMenu: true,
        bindings: [{ key: "c", meta: true }],
        keywords: "clipboard export outline",
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
        menu: "item",
        section: "Danger",
        icon: "delete",
        rowMenu: true,
        // Backspace is not printed. It fires the same command, but a menu offering two ways to
        // delete reads as two different deletions.
        bindings: [{ key: "Delete" }, { key: "Backspace" }],
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
      Command["icon"],
      number,
      KeyBinding[],
    ][] = [
      [
        "record.move-up",
        "Move up",
        "onMoveUp",
        "canMoveUp",
        "move-up",
        TOOLBAR.moveUp,
        [{ key: "ArrowUp", alt: true }],
      ],
      [
        "record.move-down",
        "Move down",
        "onMoveDown",
        "canMoveDown",
        "move-down",
        TOOLBAR.moveDown,
        [{ key: "ArrowDown", alt: true }],
      ],
      [
        "record.indent",
        "Indent",
        "onIndent",
        "canIndent",
        "indent",
        TOOLBAR.indent,
        [{ key: "Tab" }],
      ],
      [
        "record.outdent",
        "Outdent",
        "onOutdent",
        "canOutdent",
        "outdent",
        TOOLBAR.outdent,
        [{ key: "Tab", shift: true }],
      ],
    ];
    for (const [
      commandId,
      label,
      actionKey,
      capabilityKey,
      icon,
      toolbar,
      bindings,
    ] of movement) {
      const action = actions[actionKey] as ((nodeId: string) => void) | undefined;
      if (!action) continue;
      const legal = selection?.[capabilityKey];
      out.push(
        command({
          id: commandId,
          label,
          group: "record",
          menu: "organize",
          section: "Move",
          icon,
          toolbar,
          rowMenu: true,
          bindings,
          disabled: !hasSelection || legal === false,
          title: !hasSelection
            ? SELECT_REASON
            : legal === false
              ? (selection?.moveReason ?? `Cannot ${label.toLowerCase()} this row`)
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
          menu: "organize",
          section: "Expand",
          icon: canExpand ? "expand" : "collapse",
          rowMenu: true,
          bindings: [{ key: canExpand ? "ArrowRight" : "ArrowLeft" }],
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
          menu: "organize",
          section: "Expand",
          icon: "expand",
          bindings: [{ key: "ArrowRight", meta: true }],
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
          menu: "organize",
          section: "Expand",
          icon: "collapse",
          bindings: [{ key: "ArrowLeft", meta: true }],
          run: actions.onCollapseAll,
        }),
      );
    }
    if (actions.onChooseExpandThroughLevel) {
      out.push(
        command({
          id: "view.expand-through-level",
          label: "Expand through level…",
          group: "view",
          menu: "organize",
          section: "Expand",
          icon: "levels",
          run: actions.onChooseExpandThroughLevel,
        }),
      );
    } else if (actions.onExpandThroughLevel) {
      for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        out.push(
          command({
            id: `view.expand-through-${level}`,
            label: `Expand through level ${level}`,
            group: "view",
            menu: "organize",
            section: "Expand",
            icon: "levels",
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
          menu: "organize",
          section: "Priority",
          icon: "priority",
          rowMenu: true,
          keywords: "dense ranks renumber priority",
          // Repair is scoped to one sibling group, and the selected row is what names it.
          // Both hosts already no-op without a selection; saying so beats a dead click.
          disabled: !hasSelection,
          title: selectionTitle,
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
          menu: "organize",
          section: "Priority",
          icon: "priority",
          rowMenu: true,
          disabled: !hasSelection,
          title: selectionTitle,
          run: () => id && actions.onReprioritizeUnique?.(id),
        }),
      );
    }
  }

  if (capabilities.conversionKinds && actions.onConvert) {
    for (const kind of capabilities.conversionKinds) {
      // The row's current kind stays listed so the menu keeps the same shape as you move
      // between rows, but it is not a move you can make — and the server refuses it anyway.
      const alreadyThisKind = hasSelection && selection?.kind === kind;
      out.push(
        command({
          id: `record.convert.${kind}`,
          label: `Convert to ${KIND_LABELS[kind]}`,
          group: "record",
          menu: "item",
          section: "Convert to",
          icon: "convert",
          // Menu-and-palette only. Five conversion rows would be a third of the row menu's
          // height; Achieve put them behind `Actions ▸`, and a submenu is the follow-on
          // right-click spec's job.
          disabled: !hasSelection || alreadyThisKind,
          title: alreadyThisKind ? `Already a ${KIND_LABELS[kind]}` : selectionTitle,
          run: () => id && !alreadyThisKind && actions.onConvert?.(id, kind),
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
          menu: "organize",
          section: "Zoom",
          icon: "zoom-in",
          rowMenu: true,
          disabled: !hasSelection,
          title: selectionTitle,
          run: () => id && actions.onZoomIn?.(id),
        }),
      );
    }
    if (actions.onZoomOut) {
      out.push(
        command({
          id: "outline.zoom-out",
          label: "Zoom out one level",
          group: "view",
          menu: "organize",
          section: "Zoom",
          icon: "zoom-out",
          run: actions.onZoomOut,
        }),
      );
    }
    if (actions.onClearZoom) {
      out.push(
        command({
          id: "outline.zoom-clear",
          label: "Clear zoom",
          group: "view",
          menu: "organize",
          section: "Zoom",
          icon: "zoom-clear",
          run: actions.onClearZoom,
        }),
      );
    }
    if (actions.onZoomToItem) {
      out.push(
        command({
          id: "outline.zoom-to-item",
          label: "Zoom to item…",
          group: "view",
          menu: "organize",
          section: "Zoom",
          icon: "zoom-to",
          run: actions.onZoomToItem,
        }),
      );
    }
  }

  /*
   * `commandOrder` last-wins, which makes `pageCommands` an **override channel**: a page command
   * carrying the id of a built-in replaces it, in place.
   *
   * The Wish List needs this. Its Open opens the *owning node*, so "Open owner" is the honest label
   * there — and the alternative to overriding is what it did before, a hand-written row menu saying
   * "Open owner" beside a toolbar saying "Open", which is the drift this slice exists to remove.
   */
  return commandOrder(
    [...out, ...(capabilities.pageCommands ?? [])].map((entry) => ({
      ...entry,
      group: entry.group ?? "record",
    })),
  );
}
