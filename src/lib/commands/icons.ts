/**
 * The command glyph vocabulary, as ids.
 *
 * A `Command` is plain data in `src/lib/` — it is built and tested under vitest's `node`
 * environment, so it cannot hold a React component. It names a glyph and
 * `src/components/icons/commandIcons.tsx` maps the name to the drawing, which also means the
 * record over there is exhaustively typed: adding an id here fails the build until it is drawn.
 *
 * One id per *verb family*, not per command. Both priority-repair commands share `priority` and
 * all four saved-view commands share `view-save`, because an icon's job in a menu gutter is to
 * tell you which family you are reading, not to be a second label.
 */
export const COMMAND_ICON_IDS = [
  "new",
  "insert-before",
  "insert-after",
  "insert-child",
  "open",
  "rename",
  "select-all",
  "copy",
  "attach",
  "delete",
  "convert",
  "move-up",
  "move-down",
  "indent",
  "outdent",
  "expand",
  "collapse",
  "levels",
  "priority",
  "zoom-in",
  "zoom-out",
  "zoom-clear",
  "zoom-to",
  "filter",
  "fields",
  "reset",
  "panel",
  "view-save",
  "schedule",
  "state",
  "complete",
  "cut",
  "paste",
  "go-to",
  "export",
  "import",
  "settings",
  "sign-out",
] as const;

export type CommandIcon = (typeof COMMAND_ICON_IDS)[number];
