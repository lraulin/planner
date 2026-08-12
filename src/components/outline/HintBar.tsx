import { formatBindings } from "@/lib/commands/bindings";
import type { KeyBinding } from "@/lib/commands/bindings";
import {
  COLLAPSE_ALL,
  COLLAPSE_SELECTED,
  COPY_AS_TEXT,
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
  RENAME,
} from "@/lib/commands/chords";

/**
 * Achieve put its keyboard hints in a banner above the grid. They belong at the bottom:
 * persistent reference, not an announcement, and out of the way of the first row.
 *
 * Chords come from `lib/commands/chords.ts` via `formatBindings` — the same source every menu,
 * tooltip and palette row uses. The previous hand-typed list was how Insert stayed on the
 * banner after the scheme moved to Return: nothing here failed, it just kept teaching the
 * key the machine does not have. Achieve's Insert family and `F2` are still bound as
 * alternates but are not listed — a reference that teaches an unpressable key is worse
 * than no reference.
 *
 * Selection gestures (`⇧click`, `⌘click`) and the pointer verbs have no binding to ask, so
 * they stay as prose.
 */
function print(bindings: readonly KeyBinding[]): string {
  // Every chord constant has at least one entry; formatBindings only returns undefined for
  // empty / missing lists.
  return formatBindings(bindings) ?? "";
}

const HINTS: { keys: string[]; label: string }[] = [
  { keys: [print(INSERT_CHILD)], label: "add child" },
  { keys: [print(INSERT_AFTER)], label: "add after" },
  { keys: [print(INSERT_BEFORE)], label: "add before" },
  { keys: [print(OPEN_RECORD)], label: "open record" },
  { keys: [print(RENAME)], label: "rename" },
  { keys: ["↑", "↓"], label: "move selection" },
  { keys: ["⇧↑", "⇧↓", "⇧click"], label: "extend selection" },
  { keys: ["⌘click"], label: "add/remove row" },
  { keys: [print(COPY_AS_TEXT)], label: "copy as text" },
  { keys: [print(INDENT), print(OUTDENT)], label: "indent / outdent" },
  { keys: [print(MOVE_UP), print(MOVE_DOWN)], label: "move row" },
  {
    keys: [print(COLLAPSE_SELECTED), print(EXPAND_SELECTED)],
    label: "collapse / expand",
  },
  {
    keys: [print(COLLAPSE_ALL), print(EXPAND_ALL)],
    label: "collapse / expand all",
  },
  { keys: [print(DELETE_ROW)], label: "delete" },
  { keys: ["Drag"], label: "move onto or between rows" },
  { keys: ["Right-click"], label: "row menu" },
];

export function HintBar() {
  return (
    // Hidden below `md`: it is a reference for keys, drag and right-click, none of which a
    // phone has, and it was costing 180px of a 844px screen to say so.
    <footer className="hidden flex-none flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule bg-surface-raised px-3 py-1.5 text-[0.6875rem] text-ink-muted md:flex">
      {HINTS.map((hint) => (
        <span key={hint.label} className="flex items-center gap-1">
          {hint.keys.map((key, index) => (
            <span key={key} className="flex items-center gap-1">
              {index > 0 && <span className="text-ink-faint">/</span>}
              <kbd className="tabular rounded border border-rule-strong bg-surface px-1 py-px text-[0.625rem] text-ink">
                {key}
              </kbd>
            </span>
          ))}
          <span>{hint.label}</span>
        </span>
      ))}
    </footer>
  );
}
