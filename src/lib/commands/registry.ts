/**
 * What a command is, and how the palette narrows a list of them.
 *
 * Achieve kept its capabilities in menus — Actions, Tools, View, Outline. We kept ours on
 * toolbars, which meant every command we added became permanent screen furniture and the
 * grid toolbar grew to nine always-visible controls. A command declared here is rendered by
 * two surfaces instead: the `⌘K` palette, and the `⋯` overflow on the view's own toolbar.
 *
 * **One registry, two renderers.** This is the same contract `views.ts` has, for the same
 * reason: a command described in two places is a command whose two descriptions eventually
 * disagree about whether it is available or what it is called. It is also what keeps the
 * palette legal — `ux-principles.md` rules out a command reachable only by shortcut, and
 * there is no `⌘K` on a phone, so `⋯` is the visible half of every entry here.
 *
 * The pure part — the shape, and the matching — lives in `src/lib/` with its tests. The
 * provider, the palette and the overflow button are wiring (`testing.md`).
 */

/**
 * Groups order the palette and separate the overflow menu. `go` is Achieve's Go menu: the
 * views, generated from the view registry rather than written out here.
 */
export const COMMAND_GROUPS = ["go", "view", "record", "app"] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  go: "Go to",
  view: "This view",
  record: "Selected row",
  app: "App",
};

export type Command = {
  /** Unique across the whole merged list. Two rows sharing one is a bug, not a tie. */
  id: string;
  label: string;
  group: CommandGroup;
  /** Printed right-aligned, e.g. `F2`. Informational — the binding lives with its handler. */
  shortcut?: string;
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
  /** Where a command sits in a grid's compact command deck, when it has one. */
  toolbarGroup?: "create" | "selected" | "organize" | "more";
  /** A command with its own visible deck button is omitted from the contextual More menu. */
  primary?: boolean;
  /**
   * This command already has its own button on the view's toolbar, so the `⋯` menu skips it
   * — the palette still lists it.
   *
   * The two renderers are answering different questions. The palette asks "what can this app
   * do", and the answer has to be complete or you stop trusting it. `⋯` asks "what *else*
   * can this view do", and reprinting Filter and Open directly under the Filter and Open
   * buttons is the toolbar clutter this whole change exists to remove.
   */
  hasOwnControl?: boolean;
  run: () => void;
};

/** What the `⋯` menu shows: everything without a button of its own already on the bar. */
export function overflowCommands(commands: readonly Command[]): Command[] {
  return commands.filter((command) => !command.hasOwnControl);
}

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
