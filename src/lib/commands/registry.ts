/**
 * What a command is, and how the palette narrows a list of them.
 *
 * Achieve kept its capabilities in menus — Actions, Tools, View, Outline — plus icon toolbars and
 * a docked commands pane, all reading one command set. Our first attempt kept ours on a flat
 * toolbar with an unsorted `⋯` behind it, which is a menu with the organization removed. A command
 * declared here is now rendered by five surfaces: the view's **menu bar**, its **icon toolbar**,
 * the pinnable **Commands panel**, the row **context menu**, and the `⌘K` **palette** (with `⋯`
 * standing in for the menu bar below `md`).
 *
 * **One registry, every renderer.** This is the same contract `views.ts` has, for the same
 * reason: a command described in two places is a command whose two descriptions eventually
 * disagree about whether it is available, what it is called, or which key fires it. That last one
 * is why `shortcut` is gone — see `bindings.ts`.
 *
 * The pure part — the shape, the matching, and the menu tree (`menus.ts`) — lives in `src/lib/`
 * with its tests. The bar, the menus, the panel and the palette are wiring (`testing.md`).
 */

import type { KeyBinding } from "./bindings";
import type { CommandIcon } from "./icons";

/**
 * Groups order the palette. `go` is Achieve's Go menu: the views, generated from the view
 * registry rather than written out here.
 *
 * This is the **palette's** axis and is deliberately not the menu bar's — the palette answers
 * "what can this app do" and wants app-shaped buckets, while a menu bar answers "what can I do
 * here" and wants verb families. `menu` / `section` below are that second axis.
 */
export const COMMAND_GROUPS = ["go", "view", "record", "app"] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  go: "Go to",
  view: "This view",
  record: "Selected row",
  app: "App",
};

/**
 * The named menus on a view's command bar, in the order they appear.
 *
 * File is always present (app-wide verbs). The rest appear when the destination has something
 * for them — make something, act on it, restructure it, change what you are looking at, and
 * everything a single page invented for itself. A menu with nothing in it does not render,
 * so a flat catalog grid shows File plus two names and the Outline shows all six — the same
 * "a tab declares what it has" rule `data-grid.md` already imposes on columns.
 */
export const COMMAND_MENUS = [
  "file",
  "new",
  "item",
  "organize",
  "view",
  "tools",
] as const;
export type CommandMenu = (typeof COMMAND_MENUS)[number];

export const COMMAND_MENU_LABELS: Record<CommandMenu, string> = {
  file: "File",
  new: "New",
  item: "Item",
  organize: "Organize",
  view: "View",
  tools: "Tools",
};

export type Command = {
  /** Unique across the whole merged list. Two rows sharing one is a bug, not a tie. */
  id: string;
  label: string;
  group: CommandGroup;
  /**
   * Which named menu this command lives in. Required for every command except `group: "go"`
   * destinations (the sidebar is their catalog; the palette lists them as extras). Absent on
   * anything else is a `navigation.md` violation — `unplacedCommands` is the tripwire.
   */
  menu?: CommandMenu;
  /**
   * The heading it sits under inside that menu, e.g. `"Move"`. Commands sharing a section are
   * drawn together between rules, in declaration order; sections appear in the order they are
   * first declared. Absent puts it in the menu's leading unlabelled section.
   */
  section?: string;
  /** Glyph for the menu gutter, the panel row, and the toolbar button. See `icons.ts`. */
  icon?: CommandIcon;
  /**
   * Present means this command also gets an **icon button** on the command row, and the number is
   * its sort weight there. Absent means menus, panel, row menu and palette only.
   *
   * A weight rather than a boolean because the row's reading order is not the order commands
   * happen to be built in: create, then insert, then move, then indent, then the item verbs.
   */
  toolbar?: number;
  /** Appears in the right-click menu for a row, in menu-then-section order. */
  rowMenu?: boolean;
  /**
   * The keys that fire it. The first one is the one printed next to the label, and the printed
   * string is *derived* from it — see `bindings.ts` for why there is no `shortcut` field.
   */
  bindings?: readonly KeyBinding[];
  /**
   * Extra text to match on without showing it. `Weekly Schedule` should be reachable by
   * typing "calendar"; the label should not have to say "calendar" to make that work.
   */
  keywords?: string;
  /**
   * Present but unavailable — no row selected, nothing to collapse. Kept visible rather than
   * filtered out, because a command that vanishes teaches you it does not exist. `title`
   * explains why on hover, which matters far more on a disabled row than an enabled one.
   */
  disabled?: boolean;
  title?: string;
  destructive?: boolean;
  /**
   * A *non-command widget* on the view bar already controls this — the Filter button, the Group
   * by selects, the Density segments. Below `md` the command row is not rendered and `⋯` becomes
   * the menu bar, so `⋯` skips these and only these: their control is the one thing that *is*
   * still on screen down there, and reprinting `Filter…` directly under the Filter button is the
   * clutter the overflow tier exists to remove.
   *
   * `toolbar` commands are *not* skipped, for the mirror-image reason: their icon button is
   * desktop-only, so on a phone `⋯` is the only place they exist.
   */
  ownControl?: boolean;
  /**
   * Option/Alt held in a pulldown: the row swaps to this label and this run. Finder's
   * "Copy as Pathname". Only `ContextMenu` honours it — the Commands panel and palette
   * keep the primary label, and a permanent sibling command is the discoverable path.
   */
  alternate?: {
    label: string;
    title?: string;
    run: () => void;
  };
  run: () => void;
};

/**
 * Case- and gap-insensitive subsequence match: "wksch" finds `Weekly Schedule`.
 *
 * Subsequence rather than substring because the point of a palette is to type three or four
 * characters and stop. It is deliberately not fuzzy beyond that — no edit distance, no
 * transpositions — because a list of twenty commands does not need to guess, and a palette
 * that surfaces a wrong-but-close command on a typo is worse than one that surfaces nothing.
 */
function subsequenceIndex(haystack: string, needle: string): number[] | null {
  const positions: number[] = [];
  let at = 0;

  for (const character of needle) {
    const found = haystack.indexOf(character, at);
    if (found === -1) return null;
    positions.push(found);
    at = found + 1;
  }

  return positions;
}

/**
 * Lower is better. Ranks by, in order: a prefix match on the label, how early the match
 * starts, and how tightly it clusters — so "sch" puts `Weekly Schedule` above a command
 * that merely contains an s, a c and an h.
 */
function score(command: Command, query: string): number | null {
  const label = command.label.toLowerCase();
  const positions = subsequenceIndex(label, query);

  if (positions) {
    const start = positions[0];
    const spread = positions[positions.length - 1] - start;
    return (start === 0 ? 0 : 1000) + start * 10 + spread;
  }

  /*
   * Keywords are a fallback, never a way to outrank a label match — and they are matched by
   * **word prefix**, not by subsequence.
   *
   * Subsequence over the whole keyword string was the first version and it was far too
   * loose: a command with eight keywords is a forty-character haystack, and almost any short
   * query is a subsequence of one. "sched" pulled up Settings, whose keywords contain no such
   * word at all. A word either starts with what you typed or it does not.
   */
  const words = command.keywords?.toLowerCase().split(/\s+/);
  return words?.some((word) => word.startsWith(query)) ? 100_000 : null;
}

/**
 * The palette's list for a query. An empty query keeps the given order, which is how the
 * caller's grouping survives to the screen.
 *
 * Disabled commands are ranked and returned like any other: the palette shows them greyed,
 * so that "why can't I find Rename" has the answer "nothing is selected" rather than no
 * answer at all.
 */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return [...commands];

  return commands
    .map((command) => ({ command, rank: score(command, trimmed) }))
    .filter((entry): entry is { command: Command; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.command);
}

/**
 * Merge contextual commands over global ones, newest id winning, then order by group.
 *
 * A view registering `grid.reset` replaces the global entry of that id rather than adding a
 * second row saying the same thing — which is how a shared control (Reset this grid) can be
 * declared once and still do the right thing on whichever grid is on screen.
 */
export function mergeCommands(...lists: readonly (readonly Command[])[]): Command[] {
  const byId = new Map<string, Command>();
  for (const list of lists) {
    for (const command of list) byId.set(command.id, command);
  }

  const order = new Map(COMMAND_GROUPS.map((group, index) => [group, index]));
  return [...byId.values()].sort(
    (a, b) => (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0),
  );
}
