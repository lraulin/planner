"use client";

/**
 * Reorder one top-level item. Buttons rather than drag: `responsive.md` disables drag below
 * `md` and requires the ranking it would provide to exist as an explicit control anyway, and
 * the gym is one-handed. Disabled at the ends rather than absent, so the pair does not shift
 * under the thumb.
 */
export function MoveButtons({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const style =
    "flex h-tap w-tap shrink-0 items-center justify-center rounded text-[0.875rem] text-ink-faint hover:text-ink disabled:cursor-default disabled:text-ink-faint/40 disabled:hover:text-ink-faint/40";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        title="Move up"
        aria-label="Move up"
        className={style}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        title="Move down"
        aria-label="Move down"
        className={style}
      >
        ↓
      </button>
    </div>
  );
}
