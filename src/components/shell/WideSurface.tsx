/**
 * A view that genuinely cannot work narrow.
 *
 * The weekly planning board, the planning wizard and the time-chart editor are all built
 * around seeing a whole week at once. Squashing them into 390px does not make them usable, it
 * makes them illegible — so below `md` they keep their real width and pan, and say so in one
 * line rather than silently clipping (`responsive.md`).
 *
 * This is the "non-broken" tier, not a mobile design. If one of these ever earns a real phone
 * layout, it stops using this component.
 */
export function WideSurface({
  note,
  minWidthClass,
  children,
}: {
  /** One line explaining why it is wide. Shown below `md` only. */
  note: string;
  /**
   * A literal `max-md:min-w-[…]` class. Passed as a string rather than a number because
   * Tailwind only generates classes it can see written out at the call site.
   */
  minWidthClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex-none border-b border-rule bg-surface-raised px-3 py-1.5 text-[0.75rem] text-ink-muted md:hidden">
        {note}
      </p>
      <div className="min-h-0 flex-1 overflow-x-auto md:overflow-x-visible">
        <div className={`flex h-full min-h-0 ${minWidthClass}`}>{children}</div>
      </div>
    </div>
  );
}
