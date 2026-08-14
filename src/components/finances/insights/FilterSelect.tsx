"use client";

/**
 * A compact multi-select. Empty means all. 44px tap targets on compact layouts.
 */
export function FilterSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const chosen = new Set(selected);
  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? (options.find((option) => option.id === selected[0])?.label ?? "1")
        : `${selected.length}`;

  function toggle(id: string) {
    if (chosen.has(id)) onChange(selected.filter((entry) => entry !== id));
    else onChange([...selected, id]);
  }

  if (options.length === 0) return null;

  return (
    <details className="relative">
      <summary className="flex min-h-tap cursor-pointer list-none items-center gap-1.5 rounded border border-rule bg-surface px-2 text-[0.8125rem] text-ink md:min-h-0 md:py-1">
        <span className="text-ink-muted">{label}</span>
        <span>{summary}</span>
      </summary>
      <div className="absolute z-20 mt-1 max-h-64 min-w-[14rem] overflow-auto rounded border border-rule bg-surface-raised p-1 shadow-sm">
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mb-1 w-full min-h-tap rounded px-2 text-left text-[0.75rem] text-ink-muted hover:bg-surface md:min-h-0 md:py-1"
          >
            Show all
          </button>
        )}
        {options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-tap cursor-pointer items-center gap-2 rounded px-2 text-[0.8125rem] text-ink hover:bg-surface md:min-h-0 md:py-1"
          >
            <input
              type="checkbox"
              checked={chosen.has(option.id)}
              onChange={() => toggle(option.id)}
              className="size-4"
            />
            <span className="min-w-0 truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
