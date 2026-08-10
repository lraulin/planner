import { moduleLabel, type ModuleId } from "./modules";

/**
 * The phone's "you are here".
 *
 * The bottom nav names only three modules, so for the rest — reached through the More sheet —
 * this bar is the only thing that says which one you are looking at. There is no
 * desktop equivalent, and deliberately so: above `md` the sidebar's highlight already answers
 * the question, and a full-width title row would cost grid rows on every module forever.
 *
 * It also carries the safe-area inset for the notch, so modules below it can ignore it.
 */
export function MobileHeader({
  active,
  title,
}: {
  active: ModuleId | null;
  title?: string;
}) {
  return (
    <header className="pt-safe flex-none border-b border-rule bg-shell md:hidden">
      <div className="flex h-11 items-center px-3">
        <h1 className="text-[0.9375rem] font-semibold tracking-tight text-ink">
          {title ?? (active ? moduleLabel(active) : "Planner")}
        </h1>
      </div>
    </header>
  );
}
