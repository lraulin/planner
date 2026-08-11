/**
 * Achieve put its keyboard hints in a banner above the grid. They belong at the bottom:
 * persistent reference, not an announcement, and out of the way of the first row.
 *
 * One chord per row — the one that works on this keyboard. Achieve's Insert family and `F2` are
 * still bound (`lib/commands/chords.ts`) but are not listed: a reference that teaches a key the
 * machine does not have is worse than no reference. Listing both was the previous compromise, and
 * it made the top three rows read as though Insert were the real answer and ⌘Return the fallback.
 *
 * Kept in sync by hand with `chords.ts`, which is the one thing here a test cannot check — this is
 * prose about keys, not the keys themselves.
 */
const HINTS: { keys: string[]; label: string }[] = [
  { keys: ["⌥⌘⏎"], label: "add child" },
  { keys: ["⌘⏎"], label: "add after" },
  { keys: ["⇧⌘⏎"], label: "add before" },
  { keys: ["⏎"], label: "open record" },
  { keys: ["⇧⏎"], label: "rename" },
  { keys: ["↑", "↓"], label: "move selection" },
  { keys: ["⇧↑", "⇧↓", "⇧click"], label: "extend selection" },
  { keys: ["⌘click"], label: "add/remove row" },
  { keys: ["⌘C"], label: "copy as text" },
  { keys: ["Tab", "⇧Tab"], label: "indent / outdent" },
  { keys: ["⌥↑", "⌥↓"], label: "move row" },
  { keys: ["←", "→"], label: "collapse / expand" },
  { keys: ["⌘←", "⌘→"], label: "collapse / expand all" },
  { keys: ["⌫"], label: "delete" },
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
