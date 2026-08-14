/**
 * The menu tree: one declared taxonomy, four surfaces.
 *
 * `registry.ts` says what a command is; this says where it lands. The menu bar, the Commands
 * panel, a row's context menu and (below `md`) the `⋯` sheet are all this same tree rendered at
 * different sizes, which is the only reason they cannot disagree with each other. The palette
 * stays flat and complete — it is answering a different question.
 *
 * Everything here is pure and ordered deterministically. That matters more than it sounds: a menu
 * whose rows move between views is a menu you have to read every time, which is a menu you stop
 * reading.
 */

import {
  COMMAND_MENUS,
  COMMAND_MENU_LABELS,
  type Command,
  type CommandMenu,
} from "./registry";

/** Weight decades group the command row into hairline-separated segments. See `toolbarCommands`. */
export const TOOLBAR_SEGMENT = 10;

/**
 * The declared section order inside each menu.
 *
 * A table rather than "the order commands happen to be built in", because build order is an
 * implementation accident: commands arrive from `buildGridCommands`, from a tab's `pageCommands`,
 * and from `ViewPicker`, and `useCommands` hands them over in effect order, which is
 * child-before-parent. The taxonomy is a design decision and belongs written down once.
 *
 * A section not listed here still renders — it goes after the known ones, in the order it was
 * first declared — so a page can invent a `Tools` section without editing this file.
 */
export const MENU_SECTIONS: Record<CommandMenu, readonly string[]> = {
  file: ["Inbox", "Plan", "Export", "Account"],
  new: ["New", "Insert row"],
  item: ["Item", "Convert to", "Danger"],
  // `Rank` and `State` are the Day grid's; `Move` is shared with the Outline's tree moves. They are
  // listed here rather than left to first-appearance order so the Day's Organize menu reads the same
  // way the Outline's does — moves, then ranking, then state.
  organize: ["Move", "Rank", "State", "Expand", "Priority", "Zoom"],
  view: ["Saved views", "Days", "Layout", "Panels"],
  tools: [],
};

/**
 * The section families that collapse to a single row with a fly-out, on every surface that
 * renders them.
 *
 * **Declared, not derived from length.** A rule like "nest once a section passes four commands"
 * was the obvious alternative and is worse: `Convert to` has five rows on the Outline and two on
 * a flat catalog grid, so the same family would nest in one view and lie flat in the next. A
 * menu whose shape moves between views is one you re-read every time.
 *
 * These are the families where the *name* is the useful thing and the members are a
 * value-picker: which kind, which letter, which state, which level. `Item`, `Move` and `Danger`
 * are deliberately absent — those are the verbs you came for, and burying `Delete` one hover
 * deep would be hiding it rather than organizing it.
 */
export const NESTED_SECTIONS: ReadonlySet<string> = new Set([
  "Insert row",
  // The Weekly Schedule's One / Three / Five / Seven / Ten / Twenty Days — a width picker,
  // exactly the "the name is the useful thing" shape this set is for.
  "Days",
  "Convert to",
  "Rank",
  "State",
  "Expand",
  "Priority",
  "Zoom",
  // File ▸ Export ▸ CSV / JSON / YAML — a format picker, same shape as Days.
  "Export",
]);

export type MenuSection = {
  /** The heading, or `null` for a leading section that does not get one. */
  label: string | null;
  commands: Command[];
  /**
   * Render as one row that opens a fly-out (desktop) or drills in (touch), rather than as a
   * heading with its commands beneath it. Never set on an unlabelled section — there would be
   * no row to open it with.
   */
  submenu?: boolean;
};

export type CommandMenuTree = {
  id: CommandMenu;
  label: string;
  sections: MenuSection[];
};

/**
 * Dedupe by id, last declaration winning, in the order commands were declared.
 *
 * `mergeCommands` also dedupes but then sorts by palette group, which is right for the palette and
 * wrong here — it would put `Expand all items` (group `view`) above `Move up` (group `record`)
 * inside one Organize menu. Sections are ordered by `MENU_SECTIONS`; this keeps the order *within*
 * a section as declared.
 */
export function commandOrder(commands: readonly Command[]): Command[] {
  const byId = new Map<string, Command>();
  for (const command of commands) byId.set(command.id, command);
  // `Map` iterates in first-insertion order while `set` overwrites the value, which is exactly
  // "keep the position, take the newest definition".
  return [...byId.values()];
}

function sectionsFor(menu: CommandMenu, commands: readonly Command[]): MenuSection[] {
  const declared = MENU_SECTIONS[menu];
  const byLabel = new Map<string | null, Command[]>();

  for (const command of commands) {
    const label = command.section ?? null;
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(command);
    else byLabel.set(label, [command]);
  }

  const ordered: MenuSection[] = [];
  // The unlabelled section leads, then the declared order, then anything a page invented.
  const unlabelled = byLabel.get(null);
  if (unlabelled) ordered.push({ label: null, commands: unlabelled });
  for (const label of declared) {
    const bucket = byLabel.get(label);
    if (bucket) ordered.push(section(label, bucket));
  }
  for (const [label, bucket] of byLabel) {
    if (label === null || declared.includes(label)) continue;
    ordered.push(section(label, bucket));
  }

  return ordered;
}

/**
 * One labelled section, nested when its family is declared nestable.
 *
 * A **single** command never nests. `Convert to ▸` opening onto one row is a hover you have to
 * perform to learn there was nothing behind it, and it happens for real: a grid with one
 * conversion target, or a Rank section where three of the four letters are unavailable. Two is
 * the floor at which the fly-out saves a row rather than costing one.
 */
function section(label: string, commands: Command[]): MenuSection {
  return NESTED_SECTIONS.has(label) && commands.length > 1
    ? { label, commands, submenu: true }
    : { label, commands };
}

/**
 * The menu bar, and the Commands panel, which is this same tree left open.
 *
 * Commands with no `menu` are left out — they are palette-and-keyboard entries, and a grid command
 * in that state is a `navigation.md` violation waiting to be found, not something to paper over
 * here by inventing a home for it.
 */
export function buildMenus(commands: readonly Command[]): CommandMenuTree[] {
  const ordered = commandOrder(commands);

  return COMMAND_MENUS.map((id) => ({
    id,
    label: COMMAND_MENU_LABELS[id],
    sections: sectionsFor(
      id,
      ordered.filter((command) => command.menu === id),
    ),
  })).filter((menu) => menu.sections.length > 0);
}

/**
 * The icon buttons on the command row, in declared weight order.
 *
 * Ties keep declaration order — `Array.prototype.sort` is stable — so two commands sharing a
 * weight is untidy rather than unstable.
 */
export function toolbarCommands(commands: readonly Command[]): Command[] {
  return commandOrder(commands)
    .filter((command) => command.toolbar !== undefined)
    .sort((a, b) => (a.toolbar ?? 0) - (b.toolbar ?? 0));
}

/**
 * The command row, split into the segments a hairline is drawn between.
 *
 * The decade of a command's weight is its segment: create is 1x, insert 2x, move 3x, indent 4x,
 * item verbs 5x. Deriving the grouping from the weight means a new command joins the right cluster
 * by picking a number in the right range, rather than by also being added to a second list that
 * says which cluster it belongs to — which is the two-descriptions problem again, in miniature.
 *
 * A row of eleven identical bordered words is what this replaced. Segments are what let the eye
 * find a landmark without reading.
 */
export function toolbarSegments(commands: readonly Command[]): Command[][] {
  const segments: Command[][] = [];
  let current: Command[] = [];
  let decade: number | null = null;

  for (const command of toolbarCommands(commands)) {
    const next = Math.floor((command.toolbar ?? 0) / TOOLBAR_SEGMENT);
    if (decade !== null && next !== decade) {
      segments.push(current);
      current = [];
    }
    decade = next;
    current.push(command);
  }
  if (current.length > 0) segments.push(current);

  return segments;
}

/**
 * The row menu reads the same tree, but not in the bar's order.
 *
 * The bar leads with **New** because that is where a session starts. You right-clicked a row to do
 * something to *that row*, so the item verbs lead here and creation follows. Same commands, same
 * labels, same shortcuts — different question, so a different first row.
 */
const ROW_MENU_ORDER: readonly CommandMenu[] = [
  "item",
  "new",
  "organize",
  "view",
  "tools",
];

/** A section is destructive when every command in it is. `Danger` is the only one today. */
function isDestructive(section: MenuSection): boolean {
  return section.commands.every((command) => command.destructive === true);
}

/**
 * A row's right-click menu.
 *
 * Eight views used to hand-write this list, which is why `Open record` sat next to `Open` and one
 * of them printed a shortcut the other did not. Deriving it means the row menu is a *shorter view
 * of the same tree* — a command opts in with `rowMenu`, and it cannot end up called something
 * else here.
 *
 * Sections nest exactly where `NESTED_SECTIONS` says they do, which is what finally lets
 * `Convert to` onto this menu at all: its five rows were a third of the menu's height and were
 * kept off entirely, so the one view with conversions offered them nowhere on right-click.
 */
export function rowMenuSections(commands: readonly Command[]): MenuSection[] {
  const ordered = commandOrder(commands).filter((command) => command.rowMenu === true);
  const byMenu = new Map(buildMenus(ordered).map((menu) => [menu.id, menu]));

  const sections: MenuSection[] = [];
  for (const menu of ROW_MENU_ORDER) {
    for (const section of byMenu.get(menu)?.sections ?? []) sections.push(section);
  }

  // A command marked for the row menu with no `menu` would otherwise vanish. Keep it: a stray row
  // is a visible bug, a missing command is an invisible one.
  const homeless = ordered.filter((command) => command.menu === undefined);
  if (homeless.length > 0) sections.push({ label: null, commands: homeless });

  // Delete goes to the bottom wherever it appears. In the bar it is the last thing in the Item
  // menu; in a menu that opens *under the pointer*, a destructive row two places from the top is
  // a misclick, and Achieve put it near the bottom for the same reason.
  return [
    ...sections.filter((s) => !isDestructive(s)),
    ...sections.filter(isDestructive),
  ];
}

/**
 * What `⋯` shows below `md`, where it *is* the menu bar.
 *
 * The whole tree, minus the commands whose control is a widget still visible on the view bar
 * down there (`ownControl`). Menu names become the headings, so the sheet is organized the way
 * the desktop bar is instead of being the flat list this replaced.
 */
export function overflowMenus(commands: readonly Command[]): CommandMenuTree[] {
  return buildMenus(commands.filter((command) => command.ownControl !== true));
}
