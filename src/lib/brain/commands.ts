import type { Command } from "@/lib/commands/registry";
import { OPEN_RECORD, RENAME } from "@/lib/commands/chords";
import type { LinkRelation } from "./links";

/** What the view can do; the commands only say when each is available and what it is called. */
export type BrainHooks = {
  newThought: () => void;
  addLink: (relation: LinkRelation) => void;
  open: (id: string) => void;
  rename: (id: string) => void;
  editLinkLabel: (id: string) => void;
  setType: (id: string) => void;
  editTags: () => void;
  toggleHome: (id: string, makeHome: boolean) => void;
  unlink: (id: string) => void;
  remove: (id: string) => void;
  goHome: () => void;
  focusSearch: () => void;
  manageTypes: () => void;
};

export type BrainTarget = {
  id: string;
  name: string;
  isHome: boolean;
  /** The centred thought, as opposed to a neighbour right-clicked in the plex. */
  isActive: boolean;
};

/** DOM ids the view puts on its two focusable fields, so commands can reach them. */
export const BRAIN_SEARCH_ID = "brain-search";
export const BRAIN_TAGS_ID = "brain-tags";

const SEARCH_KEY = [{ key: "/" }];

/**
 * Every Brain verb, once — for the menu bar, toolbar, palette, `⋯` and the thought's
 * right-click menu alike (`navigation.md`: no command without a menu).
 *
 * `target` is the thought the item verbs act on: the active thought for the menus, the
 * right-clicked chip for the row menu. Verbs that only make sense for the centre — adding
 * links, editing tags — are listed only when the target is the active thought.
 */
export function buildBrainCommands(
  target: BrainTarget | null,
  hooks: BrainHooks,
  hasHome: boolean,
): Command[] {
  const commands: Command[] = [
    {
      id: "brain.new",
      label: "New thought",
      group: "record",
      menu: "new",
      section: "New",
      icon: "new",
      toolbar: 10,
      keywords: "create add thought",
      run: hooks.newThought,
    },
    {
      id: "brain.search",
      label: "Search thoughts",
      group: "view",
      menu: "view",
      section: "Find",
      icon: "go-to",
      bindings: SEARCH_KEY,
      keywords: "jump find recent",
      ownControl: true,
      run: hooks.focusSearch,
    },
    {
      id: "brain.home",
      label: "Go to Home",
      group: "view",
      menu: "item",
      section: "Go",
      icon: "go-to",
      disabled: !hasHome,
      title: hasHome ? undefined : "No Home thought is set yet",
      run: hooks.goHome,
    },
    {
      id: "brain.types",
      label: "Manage types…",
      group: "app",
      menu: "tools",
      section: "Types",
      icon: "settings",
      keywords: "colour color category",
      run: hooks.manageTypes,
    },
  ];

  if (!target) return commands;
  const { id, isActive } = target;

  if (isActive) {
    commands.push(
      {
        id: "brain.add-child",
        label: "Add child…",
        group: "record",
        menu: "new",
        section: "Add link",
        icon: "insert-child",
        toolbar: 20,
        rowMenu: true,
        keywords: "link below",
        run: () => hooks.addLink("child"),
      },
      {
        id: "brain.add-parent",
        label: "Add parent…",
        group: "record",
        menu: "new",
        section: "Add link",
        icon: "insert-before",
        toolbar: 21,
        rowMenu: true,
        keywords: "link above",
        run: () => hooks.addLink("parent"),
      },
      {
        id: "brain.add-jump",
        label: "Add jump…",
        group: "record",
        menu: "new",
        section: "Add link",
        icon: "go-to",
        toolbar: 22,
        rowMenu: true,
        keywords: "link related lateral",
        run: () => hooks.addLink("jump"),
      },
      {
        id: "brain.tags",
        label: "Edit tags",
        group: "record",
        menu: "item",
        section: "Item",
        icon: "attach",
        rowMenu: true,
        run: hooks.editTags,
      },
    );
  } else {
    commands.push({
      id: "brain.open",
      label: "Open",
      group: "record",
      menu: "item",
      section: "Item",
      icon: "open",
      bindings: OPEN_RECORD,
      rowMenu: true,
      run: () => hooks.open(id),
    });
  }

  commands.push(
    {
      id: "brain.rename",
      label: "Rename…",
      group: "record",
      menu: "item",
      section: "Item",
      icon: "rename",
      bindings: RENAME,
      rowMenu: true,
      run: () => hooks.rename(id),
    },
    {
      id: "brain.type",
      label: "Set type…",
      group: "record",
      menu: "item",
      section: "Item",
      icon: "convert",
      rowMenu: true,
      run: () => hooks.setType(id),
    },
    {
      id: "brain.set-home",
      label: target.isHome ? "Clear Home" : "Set as Home",
      group: "record",
      menu: "item",
      section: "Item",
      icon: "go-to",
      rowMenu: true,
      run: () => hooks.toggleHome(id, !target.isHome),
    },
  );

  if (!isActive) {
    commands.push(
      {
        id: "brain.link-label",
        label: "Edit link label…",
        group: "record",
        menu: "item",
        section: "Item",
        icon: "rename",
        rowMenu: true,
        run: () => hooks.editLinkLabel(id),
      },
      {
        id: "brain.unlink",
        label: "Unlink from active thought",
        group: "record",
        menu: "item",
        section: "Item",
        icon: "cut",
        rowMenu: true,
        run: () => hooks.unlink(id),
      },
    );
  }

  commands.push({
    id: "brain.delete",
    label: "Delete thought…",
    group: "record",
    menu: "item",
    section: "Danger",
    icon: "delete",
    destructive: true,
    rowMenu: true,
    run: () => hooks.remove(id),
  });

  return commands;
}
