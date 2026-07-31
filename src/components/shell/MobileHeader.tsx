import { tabLabel, type TabId } from "./tabs";

/**
 * The phone's "you are here".
 *
 * The bottom nav names only three of the ten views, so for the seven reached through the More
 * sheet this bar is the only thing that says which one you are looking at. It also carries
 * the safe-area inset for the notch, so views below it can ignore it entirely.
 */
export function MobileHeader({ active }: { active: TabId }) {
  return (
    <header className="pt-safe flex-none border-b border-rule bg-shell md:hidden">
      <div className="flex h-11 items-center px-3">
        <h1 className="text-[0.9375rem] font-semibold tracking-tight text-ink">
          {tabLabel(active)}
        </h1>
      </div>
    </header>
  );
}
