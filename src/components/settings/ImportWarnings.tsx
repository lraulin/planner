/** How many warnings an import result lists before summarising the rest. */
const SHOWN = 20;

/**
 * An import's warnings, folded under a count: the first twenty, then how many more.
 * Renders nothing when the import raised none.
 */
export function ImportWarnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-ink-muted">
        {warnings.length} warning
        {warnings.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-1 list-inside list-disc text-ink-faint">
        {warnings.slice(0, SHOWN).map((w, i) => (
          // Warnings often repeat the same text (same rule on many rows).
          <li key={`${i}-${w.slice(0, 48)}`}>{w}</li>
        ))}
        {warnings.length > SHOWN && (
          <li key="more">…and {warnings.length - SHOWN} more</li>
        )}
      </ul>
    </details>
  );
}
