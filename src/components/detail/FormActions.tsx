/**
 * Cancel and the submit button at the foot of a small form dialog — the form's own submit,
 * so Return saves. The submit reads "Saving…" while `pending`, and stays disabled while
 * pending or while `disabled` says the form cannot be sent yet.
 */
export function FormActions({
  submitLabel,
  pending,
  disabled = false,
  onCancel,
  className = "",
}: {
  submitLabel: string;
  pending: boolean;
  disabled?: boolean;
  onCancel: () => void;
  /** Spacing from the content above, when the form does not provide it. */
  className?: string;
}) {
  return (
    <div className={`flex justify-end gap-2 ${className}`}>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:border-rule-strong hover:bg-surface-raised md:min-h-0 md:py-1.5"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending || disabled}
        className="min-h-tap rounded border border-select-edge bg-select px-3 text-[0.8125rem] font-medium text-ink disabled:opacity-50 md:min-h-0 md:py-1.5"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}
