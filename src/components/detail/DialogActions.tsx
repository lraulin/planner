/**
 * The Cancel / confirm pair at the foot of a choice dialog — zoom in, convert, set a
 * priority, choose a project. The confirm button is the filled one; `disabled` holds it
 * until the choice is valid.
 */
export function DialogActions({
  confirmLabel,
  onConfirm,
  onCancel,
  disabled = false,
}: {
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="min-h-tap rounded bg-select-edge px-3 text-[0.8125rem] text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 md:min-h-0 md:py-1.5"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
