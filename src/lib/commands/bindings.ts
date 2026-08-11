/**
 * A keyboard binding, as data.
 *
 * Before this, a command printed its shortcut as a string (`"⌥↑"`) while the key that actually
 * fired it lived in a `switch` inside whichever view happened to own a `document` listener —
 * eleven of them. That is the same failure `navigation.md` already names for labels: a thing
 * described in two places is a thing whose two descriptions eventually disagree. A menu can
 * promise `⌘C` for years after the handler stopped accepting it and nothing will notice.
 *
 * So the binding is the truth and the printed shortcut is derived from it (`formatBinding`).
 * There is one dispatcher (`useCommandKeys`) and it matches with `matchBinding`.
 *
 * It also makes Achieve's Customize Keyboard dialog possible later — a rebindable shortcut needs
 * exactly one place that owns the binding. Not in this slice, but this is the shape it needs.
 */

export type KeyBinding = {
  /** An `event.key` value. Single characters are matched case-insensitively. */
  key: string;
  /**
   * The platform's command modifier: `⌘` on Apple keyboards, `Ctrl` everywhere else. Either
   * satisfies it, which is what every hand-written handler in the app already did.
   */
  meta?: boolean;
  /**
   * The physical Control key, as distinct from `meta`. Achieve used it for "as child"
   * (`⌃Insert`), and on a Mac that is a different chord from `⌘Insert`. The chords the app
   * teaches now live in `chords.ts`.
   */
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
};

/** The part of a `KeyboardEvent` a binding cares about, so this stays testable in node. */
export type KeyEventLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

function sameKey(eventKey: string, bindingKey: string): boolean {
  return eventKey.toLowerCase() === bindingKey.toLowerCase();
}

/**
 * Modifiers are matched **exactly**, not as a minimum.
 *
 * `⌘⏎`, `⇧⌘⏎` and `⌥⌘⏎` are three different commands — insert after, before, and as child, all on
 * one key. A binding that ignored the modifiers it did not name would make plain `⌘⏎` fire on all
 * three, and the one that fires would be whichever the dispatcher happened to test first.
 */
export function matchBinding(event: KeyEventLike, binding: KeyBinding): boolean {
  if (!sameKey(event.key, binding.key)) return false;
  if (Boolean(binding.alt) !== event.altKey) return false;
  if (Boolean(binding.shift) !== event.shiftKey) return false;

  // Ctrl cannot stand in for `⌘` here: it is already spoken for by `ctrl`, so the chord needs
  // both keys down.
  if (binding.meta && binding.ctrl) return event.metaKey && event.ctrlKey;
  if (binding.meta) return event.metaKey || event.ctrlKey;
  if (binding.ctrl) return event.ctrlKey && !event.metaKey;
  return !event.metaKey && !event.ctrlKey;
}

/** True when any of a command's bindings matches. The first one is the one that gets printed. */
export function matchBindings(
  event: KeyEventLike,
  bindings: readonly KeyBinding[] | undefined,
): boolean {
  return bindings?.some((binding) => matchBinding(event, binding)) ?? false;
}

/** `⌃⌥⇧⌘` — the macOS order, which is also the order Achieve printed them in. */
const MODIFIERS: readonly [keyof KeyBinding, string][] = [
  ["ctrl", "⌃"],
  ["alt", "⌥"],
  ["shift", "⇧"],
  ["meta", "⌘"],
];

/**
 * Keys that print as a glyph. Everything absent here prints its own name, so `F2`, `Insert`,
 * `Delete` and `Tab` come out as themselves. Those four are alternates now rather than the chord
 * being taught (`chords.ts`), but they still have to print correctly wherever they are first.
 */
const KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "⏎",
  Escape: "Esc",
  " ": "Space",
  // The key a MacBook labels *delete* sends `Backspace`; the glyph is what is engraved on it, and
  // printing the word would name a key this keyboard does not have.
  Backspace: "⌫",
};

export function formatBinding(binding: KeyBinding): string {
  const modifiers = MODIFIERS.filter(([field]) => binding[field] === true)
    .map(([, glyph]) => glyph)
    .join("");

  const key =
    KEY_LABELS[binding.key] ??
    (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);

  return `${modifiers}${key}`;
}

/**
 * What a menu, panel row, or palette row prints for a command. `undefined` when the command has
 * no binding, which is most of them.
 */
export function formatBindings(
  bindings: readonly KeyBinding[] | undefined,
): string | undefined {
  return bindings && bindings.length > 0 ? formatBinding(bindings[0]) : undefined;
}
