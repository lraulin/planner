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

/**
 * The primary chord shared by "new row after" and "commit form and leave". One object so a
 * rebind of the platform command+Return cannot leave the two surfaces disagreeing.
 */
const META_ENTER: KeyBinding = { key: "Enter", meta: true };

/** `⌘⏎` — new sibling below the selection. Achieve's `Insert`. */
export const INSERT_AFTER: KeyBinding[] = [META_ENTER, { key: "Insert" }];

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

/** `⌘C` — copy the selection as plain text. */
export const COPY_AS_TEXT: KeyBinding[] = [{ key: "c", meta: true }];

/** `⌘A` — select every navigable row. Does not fire while typing (`CommandKeys`). */
export const SELECT_ALL: KeyBinding[] = [{ key: "a", meta: true }];

/** `⌘X` — pick rows up for paste elsewhere. */
export const CUT_ROWS: KeyBinding[] = [{ key: "x", meta: true }];

/** `⌘V` — drop the pickup after the selection. */
export const PASTE_ROWS: KeyBinding[] = [{ key: "v", meta: true }];

/** `⌥↑` / `⌥↓` — reorder among siblings. */
export const MOVE_UP: KeyBinding[] = [{ key: "ArrowUp", alt: true }];
export const MOVE_DOWN: KeyBinding[] = [{ key: "ArrowDown", alt: true }];

/** `Tab` / `⇧Tab` — indent and outdent. */
export const INDENT: KeyBinding[] = [{ key: "Tab" }];
export const OUTDENT: KeyBinding[] = [{ key: "Tab", shift: true }];

/** `→` / `←` — expand or collapse the selected branch. */
export const EXPAND_SELECTED: KeyBinding[] = [{ key: "ArrowRight" }];
export const COLLAPSE_SELECTED: KeyBinding[] = [{ key: "ArrowLeft" }];

/** `⌘→` / `⌘←` — expand or collapse every branch. */
export const EXPAND_ALL: KeyBinding[] = [{ key: "ArrowRight", meta: true }];
export const COLLAPSE_ALL: KeyBinding[] = [{ key: "ArrowLeft", meta: true }];

/** `⌃L` — complete the selection (Achieve). */
export const COMPLETE: KeyBinding[] = [{ key: "l", ctrl: true }];

/** `⌃⌥⇧B` — schedule a block (Achieve). */
export const SCHEDULE_BLOCK: KeyBinding[] = [
  { key: "b", ctrl: true, alt: true, shift: true },
];

/** `⌃T` — view the selection's tasks (Achieve). */
export const VIEW_TASKS: KeyBinding[] = [{ key: "t", ctrl: true }];

/** `⌃⇧J` — jump to the owning project (Achieve). */
export const VIEW_PROJECT: KeyBinding[] = [{ key: "j", ctrl: true, shift: true }];

/**
 * `⌘S` — save without leaving. Same chord the drawer footer teaches; named once so a
 * hand-typed tooltip cannot drift from the listener that actually fires.
 */
export const SAVE: KeyBinding[] = [{ key: "s", meta: true }];

/**
 * `⌘⏎` — commit a form and leave (drawer Save & Close, organizer Process).
 *
 * Same primary key as `INSERT_AFTER` (via `META_ENTER`). Named separately so a form footer
 * does not import a create chord by name; the binding object is shared.
 */
export const COMMIT_FORM: KeyBinding[] = [META_ENTER];

/** `⌘K` — open the command palette. Owned by `CommandPalette`, taught by the sidebar Search row. */
export const OPEN_PALETTE: KeyBinding[] = [{ key: "k", meta: true }];

/**
 * Bare `C` — quick capture. Owned by `QuickCaptureDialog`'s own listener (it has to stand
 * down while a modal is open); declared here so the palette and any chrome that print it
 * ask the same binding.
 */
export const QUICK_CAPTURE: KeyBinding[] = [{ key: "c" }];

/**
 * `⇧⌘F` — Advanced Find.
 *
 * Not `⌘F`: that is the browser's own find-in-page, and taking it from a document-shaped app
 * is the kind of override people fight for the life of the product. `⇧⌘F` is what editors
 * use for find-across-everything, which is exactly what this is.
 */
export const OPEN_FIND: KeyBinding[] = [
  { key: "f", meta: true, shift: true },
  { key: "f", ctrl: true, shift: true },
];

/** `⌘B` / `⌘I` — markdown wrap toggles in the note editor. */
export const MARKDOWN_BOLD: KeyBinding[] = [{ key: "b", meta: true }];
export const MARKDOWN_ITALIC: KeyBinding[] = [{ key: "i", meta: true }];
