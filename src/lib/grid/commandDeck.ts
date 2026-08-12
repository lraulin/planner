import type { Command } from "@/lib/commands/registry";
import type { KeyBinding } from "@/lib/commands/bindings";
import {
  COLLAPSE_ALL,
  COLLAPSE_SELECTED,
  COMPLETE,
  COPY_AS_TEXT,
  CUT_ROWS,
  DELETE_ROW,
  EXPAND_ALL,
  EXPAND_SELECTED,
  INDENT,
  INSERT_AFTER,
  INSERT_BEFORE,
  INSERT_CHILD,
  MOVE_DOWN,
  MOVE_UP,
  OPEN_RECORD,
  OUTDENT,
  PASTE_ROWS,
  RENAME,
  SCHEDULE_BLOCK,
  VIEW_PROJECT,
  VIEW_TASKS,
} from "@/lib/commands/chords";
import { commandOrder } from "@/lib/commands/menus";
import {
  KIND_LABELS,
  STATE_LABELS,
  SUB_KIND_LABELS,
  type NodeKind,
} from "@/lib/tree/hierarchy";
import type { NodeState } from "@/db/schema";

/** The state vocabulary, in the order Achieve lists it — `STATE_LABELS`' own key order. */
const NODE_STATES = Object.keys(STATE_LABELS) as NodeState[];

export type CreateMode = "top" | "before" | "after" | "child";

export type GridSelectionCapability = {
  id: string | null;
  count?: number;
  label?: string | null;
  kind?: NodeKind;
  /** Where the row sits now, so `Complete` can grey itself on a row that already is. */
  state?: NodeState | null;
  /** Specific reason lifecycle commands cannot act on this selection. */
  stateReason?: string | null;
  /**
   * The project this row belongs to, for `View project…`. Stated by the host because only it
   * knows how its rows relate to the tree — the Chooser's rows are tasks under projects, the
   * Wish List's are items owned by a node.
   */
  projectId?: string | null;
  /** This row has tasks under it, for `View tasks…`. */
  hasTasks?: boolean;
  /**
   * The rows a **plural** command acts on, already reduced to selection roots by the host.
   *
   * Only Delete, the state changes and the row clipboard read it: those are the verbs you
   * genuinely do to several rows at once. Open, Rename, Indent and Convert stay single —
   * opening three drawers is not a thing. Absent means "just `id`".
   */
  ids?: readonly string[];
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
  /**
   * Move the row to a work state. Achieve's `Complete Item(s)…` (`Ctrl+L`) plus the rest of the
   * vocabulary behind `State ▸`.
   *
   * Hosts route this through `useStateChange`, so the branch cascade and its one confirmation
   * are unchanged — this adds a menu path to what the State cell already did, which is what the
   * keyboard and a multi-row selection never had.
   */
  onSetState?: (ids: readonly string[], state: NodeState) => void;
  /** Put this row on the calendar. Achieve's `Schedule Block in Calendar…`. */
  onScheduleBlock?: (id: string) => void;
  /** Achieve's `View Tasks…` — the Tasks module scoped to this row. */
  onViewTasks?: (id: string) => void;
  /** Achieve's `View Project…` — open the project this row belongs to. */
  onViewProject?: (projectId: string) => void;
  /** Achieve's `Pickup Row(s)` — mark the selection for a move. See `rowClipboard.ts`. */
  onCutRows?: (ids: readonly string[]) => void;
  /** Drop the picked-up rows beside this one, or under it. */
  onPasteRows?: (targetId: string, at: "after" | "child") => void;
  onRename?: (id: string) => void;
  onDelete?: (ids: readonly string[]) => void;
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
  /**
   * The row clipboard's state, as the host resolved it for *this* row: how many rows are
   * picked up, and why a paste here would be refused.
   *
   * The reason is computed by the host rather than derived here, because only it holds the tree
   * — `pasteRefusal` needs every row's parent and kind, and `commandDeck` deliberately knows
   * about neither.
   */
  clipboard?: {
    pickedUp: number;
    /** `null` when a paste beside this row is legal. */
    pasteAfterRefusal: string | null;
    pasteChildRefusal: string | null;
  };
  createKinds?: readonly NodeKind[];
  /**
   * Offer `New subtask` / `New subproject` — one row filed under the selected one.
   *
   * Separate from {@link GridCommandCapabilities.hierarchy} on purpose. The module grids are
   * *projections* of the tree, so they do not get the Outline's insert set (before / after /
   * child relative to the cursor) — those read as outline surgery and belong where the outline
   * is. But "this project needs a subproject" is a plain creation verb, and without it the only
   * way to file work under something was to go to the Outline and find it there.
   */
  createChild?: boolean;
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
  /**
   * What a plural command acts on, and how many it says.
   *
   * `count` was already threaded through for `Copy as text (3)`; the rows themselves were not,
   * so Delete on a three-row selection quietly removed one. `ids` is the honest answer and
   * `count` is what gets printed, with the fallback keeping single-selection hosts unchanged.
   */
  const targetIds = selection?.ids ?? (id ? [id] : []);
  const many = (selection?.count ?? targetIds.length) > 1;
  const suffix = many ? ` (${selection?.count ?? targetIds.length})` : "";
  const kinds = capabilities.createKinds ?? [];
  const defaultKind = kinds[0];
  const out: Command[] = [];

  if (actions.onCreate && defaultKind) {
    /*
     * A module that makes exactly one kind names it on the button: `New task`, not `New`.
     *
     * The bare `New` is for the Outline, where the label cannot say what it makes because the
     * New menu beneath it offers five answers. Single-kind hosts have no such menu — and listing
     * `New` above `New task` there was one command printed twice.
     */
    const single = kinds.length === 1;
    out.push(
      command({
        id: "grid.create",
        label: single ? `New ${KIND_LABELS[defaultKind].toLowerCase()}` : "New",
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

    if (!single) {
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
    }

    if (capabilities.createChild) {
      /*
       * The kind continues the row it is filed under, when this module makes that kind — a
       * sub-dream under a dream, a subtask under a task. Where it does not (a goal shown in the
       * Projects tab), the module's own kind is the honest answer: `New subproject` on a goal
       * files a project under it, which is both legal and what the label says.
       */
      const kind =
        selection?.kind && kinds.includes(selection.kind)
          ? selection.kind
          : defaultKind;
      out.push(
        command({
          id: "grid.create.subitem",
          label: `New ${SUB_KIND_LABELS[kind].toLowerCase()}`,
          group: "record",
          menu: "new",
          section: "New",
          icon: "insert-child",
          toolbar: TOOLBAR.insertChild,
          rowMenu: true,
          bindings: INSERT_CHILD,
          keywords: "add child under subproject subtask",
          disabled: !hasSelection,
          title: selectionTitle,
          run: () => actions.onCreate?.(kind, "child"),
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
        bindings: OPEN_RECORD,
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
        bindings: RENAME,
        disabled: !hasSelection,
        title: selectionTitle,
        run: () => id && actions.onRename?.(id),
      }),
    );
  }
  if (actions.onSetState) {
    const settled = selection?.state === "completed";
    const stateReason = selection?.stateReason ?? null;
    out.push(
      command({
        id: "record.complete",
        label: `Complete${suffix}`,
        group: "record",
        menu: "item",
        section: "Item",
        icon: "complete",
        rowMenu: true,
        // Achieve's Ctrl+L. The one state change common enough to be a verb of its own rather
        // than a value in the picker below.
        bindings: COMPLETE,
        keywords: "done finish tick",
        disabled: !hasSelection || stateReason !== null || settled,
        title: !hasSelection
          ? selectionTitle
          : (stateReason ?? (settled ? "Already completed" : undefined)),
        run: () => actions.onSetState?.(targetIds, "completed"),
      }),
    );

    // The rest of the vocabulary, behind `State ▸`. Nine rows inline would be half the menu;
    // the row's own State cell is the pointer path and this is the keyboard's.
    for (const state of NODE_STATES) {
      out.push(
        command({
          id: `record.state.${state}`,
          label: `${STATE_LABELS[state]}${suffix}`,
          group: "record",
          menu: "organize",
          section: "State",
          icon: "state",
          rowMenu: true,
          keywords: "state status mark",
          disabled: !hasSelection || stateReason !== null || selection?.state === state,
          title: !hasSelection
            ? selectionTitle
            : (stateReason ??
              (selection?.state === state
                ? `Already ${STATE_LABELS[state].toLowerCase()}`
                : undefined)),
          run: () => actions.onSetState?.(targetIds, state),
        }),
      );
    }
  }

  if (actions.onScheduleBlock) {
    out.push(
      command({
        id: "record.schedule-block",
        label: "Schedule block…",
        group: "record",
        menu: "item",
        section: "Item",
        icon: "schedule",
        rowMenu: true,
        // Achieve's Ctrl+Alt+Shift+B.
        bindings: SCHEDULE_BLOCK,
        keywords: "calendar appointment time week",
        disabled: !hasSelection,
        title: selectionTitle,
        run: () => id && actions.onScheduleBlock?.(id),
      }),
    );
  }

  if (actions.onViewTasks) {
    const hasTasks = selection?.hasTasks !== false;
    out.push(
      command({
        id: "record.view-tasks",
        label: "View tasks…",
        group: "record",
        menu: "item",
        section: "Item",
        icon: "go-to",
        rowMenu: true,
        // Achieve's Ctrl+T.
        bindings: VIEW_TASKS,
        keywords: "children subtasks scope",
        disabled: !hasSelection || !hasTasks,
        title: !hasSelection
          ? SELECT_REASON
          : hasTasks
            ? undefined
            : "Nothing is filed under this row",
        run: () => id && actions.onViewTasks?.(id),
      }),
    );
  }

  if (actions.onViewProject) {
    const projectId = selection?.projectId ?? null;
    out.push(
      command({
        id: "record.view-project",
        label: "View project…",
        group: "record",
        menu: "item",
        section: "Item",
        icon: "go-to",
        rowMenu: true,
        // Achieve's Ctrl+Shift+J.
        bindings: VIEW_PROJECT,
        keywords: "parent owner belongs",
        disabled: !hasSelection || projectId === null,
        title: !hasSelection
          ? SELECT_REASON
          : projectId === null
            ? "This row is not under a project"
            : undefined,
        run: () => projectId && actions.onViewProject?.(projectId),
      }),
    );
  }

  if (actions.onCutRows) {
    out.push(
      command({
        id: "record.cut-rows",
        label: `Cut${suffix}`,
        group: "record",
        menu: "item",
        section: "Item",
        icon: "cut",
        rowMenu: true,
        bindings: CUT_ROWS,
        keywords: "pickup move relocate",
        disabled: !hasSelection,
        title: hasSelection
          ? "Pick these rows up, then paste them somewhere else"
          : SELECT_REASON,
        run: () => actions.onCutRows?.(targetIds),
      }),
    );
  }

  if (actions.onPasteRows) {
    const clipboard = capabilities.clipboard;
    const picked = clipboard?.pickedUp ?? 0;
    const pasted = picked > 1 ? ` ${picked} rows` : picked === 1 ? " row" : "";
    // A branch, not `??`: the refusal is `string | null` and `null` is the *legal* value, so
    // coalescing it would grey out exactly the pastes that are allowed. It did, until the
    // browser said "Paste row" and "Nothing has been picked up" in the same row.
    const noClipboard = "Nothing has been picked up";
    const pastes: [string, string, "after" | "child", string | null][] = [
      [
        "record.paste-rows",
        `Paste${pasted}`,
        "after",
        clipboard ? clipboard.pasteAfterRefusal : noClipboard,
      ],
      [
        "record.paste-child",
        `Paste${pasted} as child`,
        "child",
        clipboard ? clipboard.pasteChildRefusal : noClipboard,
      ],
    ];

    for (const [commandId, label, at, refusal] of pastes) {
      out.push(
        command({
          id: commandId,
          label,
          group: "record",
          menu: "item",
          section: "Item",
          icon: "paste",
          rowMenu: true,
          bindings: at === "after" ? PASTE_ROWS : undefined,
          keywords: "drop move relocate",
          // The refusal is the whole point: "Paste" greyed with no reason is
          // indistinguishable from a broken menu, and there are five distinct reasons.
          disabled: refusal !== null,
          title: refusal ?? undefined,
          run: () => id && actions.onPasteRows?.(id, at),
        }),
      );
    }
  }

  if (actions.onCopyAsText) {
    out.push(
      command({
        id: "record.copy-as-text",
        label: `Copy as text${suffix}`,
        group: "record",
        menu: "item",
        section: "Item",
        icon: "copy",
        rowMenu: true,
        bindings: COPY_AS_TEXT,
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
        label: `Delete${suffix}`,
        group: "record",
        menu: "item",
        section: "Danger",
        icon: "delete",
        rowMenu: true,
        bindings: DELETE_ROW,
        destructive: true,
        disabled: !hasSelection,
        title: selectionTitle,
        run: () => actions.onDelete?.(targetIds),
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
        MOVE_UP,
      ],
      [
        "record.move-down",
        "Move down",
        "onMoveDown",
        "canMoveDown",
        "move-down",
        TOOLBAR.moveDown,
        MOVE_DOWN,
      ],
      [
        "record.indent",
        "Indent",
        "onIndent",
        "canIndent",
        "indent",
        TOOLBAR.indent,
        INDENT,
      ],
      [
        "record.outdent",
        "Outdent",
        "onOutdent",
        "canOutdent",
        "outdent",
        TOOLBAR.outdent,
        OUTDENT,
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
          bindings: canExpand ? EXPAND_SELECTED : COLLAPSE_SELECTED,
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
          bindings: EXPAND_ALL,
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
          bindings: COLLAPSE_ALL,
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
          // On the row menu as one `Convert to ▸` row. Five inline rows were a third of the
          // menu's height, which is why these were kept off it entirely and the one view with
          // conversions offered them nowhere on right-click. `NESTED_SECTIONS` is the fix.
          rowMenu: true,
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
