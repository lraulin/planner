import type { KeyBinding } from "./bindings";

/**
 * The app's named chords — the keyboard scheme itself, as opposed to `bindings.ts`, which is the
 * machinery that matches and prints one.
 *
 * These lists were copied into five files (`commandDeck`, `catalogCommands`, `NotesGrid`,
 * `DailyItemsGrid`, `FitnessView`) before they were worth naming, which is how the calendar ended
 * up binding `Delete` without the `Backspace` beside it that every grid had. A scheme described in
 * five places is a scheme whose five descriptions eventually disagree.
 *
 * ## Why Return, not Insert
 *
 * Achieve's vocabulary was built on Insert: `Insert` after, `⇧Insert` before, `⌃Insert` as child,
 * `F2` to rename. **We deliberately diverge**, because MacBook hardware has no Insert key and macOS
 * generates no Insert event for any chord — Fn+Return sends the keypad Enter, which arrives as
 * `key: "Enter"`. There is no setting that fixes this; only a remapper like Karabiner could
 * synthesise the key, and that is not a reasonable thing to require of the app's only user.
 *
 * So Return takes Insert's job, and the family reads as one idea: `⏎` acts on the selected row,
 * `⇧⏎` edits it in place, and adding `⌘` makes a new row instead — with `⇧` and `⌥` choosing
 * before or child.
 *
 * ## Mac chord first, PC chord second
 *
 * `formatBindings` prints `bindings[0]`, so **the first entry is the one being taught** and the
 * rest are silent alternates. Achieve's chords are kept in second position: they still fire on a
 * full keyboard, and nothing in the UI promises a key this laptop does not have. That is the same
 * rule `record.delete` already followed for `Backspace` — one command, one printed chord, however
 * many ways there are to reach it.
 */

/** `⌘⏎` — new sibling below the selection. Achieve's `Insert`. */
export const INSERT_AFTER: KeyBinding[] = [
  { key: "Enter", meta: true },
  { key: "Insert" },
];

/** `⇧⌘⏎` — new sibling above the selection. Achieve's `⇧Insert`. */
export const INSERT_BEFORE: KeyBinding[] = [
  { key: "Enter", meta: true, shift: true },
  { key: "Insert", shift: true },
];

/**
 * `⌥⌘⏎` — new row filed under the selection. Achieve's `⌃Insert`.
 *
 * `⌥` rather than `⌃` because on a MacBook `⌃` and `⌘` sit either side of `⌥`, making `⌃⌘⏎` a
 * two-handed claw; `⌥⌘⏎` is adjacent keys under one thumb and forefinger. This is the chord used
 * most often, so it is the one that had to be comfortable.
 */
export const INSERT_CHILD: KeyBinding[] = [
  { key: "Enter", meta: true, alt: true },
  { key: "Insert", ctrl: true },
];

/** `⏎` — open the selected record. */
export const OPEN_RECORD: KeyBinding[] = [{ key: "Enter" }];

/**
 * `⇧⏎` — rename in place. Achieve's `F2`.
 *
 * `F2` alone meant Fn+F2 on a laptop whose function row is brightness by default. The chord reads
 * as a lighter `⏎`: same row, edited rather than opened.
 */
export const RENAME: KeyBinding[] = [{ key: "Enter", shift: true }, { key: "F2" }];

/**
 * `⌫` — delete the selection.
 *
 * `Backspace` first because that is what the key labelled *delete* on a MacBook actually sends;
 * `Delete` is forward-delete, reachable only as Fn+⌫. Both fire, one is printed — a menu offering
 * two ways to delete reads as two different deletions.
 */
export const DELETE_ROW: KeyBinding[] = [{ key: "Backspace" }, { key: "Delete" }];
