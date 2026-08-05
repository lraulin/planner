import { viewLabel, type ViewId } from "./views";

/**
 * The phone's "you are here".
 *
 * The bottom nav names only three of the eleven views, so for the rest — reached through the
 * More sheet — this bar is the only thing that says which one you are looking at. There is no
 * desktop equivalent, and deliberately so: above `md` the sidebar's highlight already answers
 * the question, and a full-width title row would cost grid rows on every view forever.
 *
 * It also carries the safe-area inset for the notch, so views below it can ignore it.
 */
export function MobileHeader({ active }: { active: ViewId }) {
  return (
    <header className="pt-safe flex-none border-b border-rule bg-shell md:hidden">
      <div className="flex h-11 items-center px-3">
        <h1 className="text-[0.9375rem] font-semibold tracking-tight text-ink">
          {viewLabel(active)}
        </h1>
      </div>
    </header>
  );
}
