/**
 * Achieve put its keyboard hints in a banner above the grid. They belong at the bottom:
 * persistent reference, not an announcement, and out of the way of the first row.
 *
 * Apple keyboards have no Insert key, so ⌘Return is bound alongside it. Both are listed
 * rather than detected, which keeps this a server component and tells the whole truth.
 */
const HINTS: { keys: string[]; label: string }[] = [
  { keys: ["Insert", "⌘Return"], label: "add after" },
  { keys: ["⇧Insert"], label: "add before" },
  { keys: ["⌃Insert"], label: "add child" },
  { keys: ["Enter"], label: "edit" },
  { keys: ["↑", "↓"], label: "move selection" },
  { keys: ["Tab", "⇧Tab"], label: "indent / outdent" },
  { keys: ["⌥↑", "⌥↓"], label: "move row" },
  { keys: ["←", "→"], label: "collapse / expand" },
  { keys: ["Delete"], label: "delete" },
];

export function HintBar() {
  return (
    <footer className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule bg-surface-raised px-3 py-1.5 text-[0.6875rem] text-ink-muted">
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
