import { QuickCapture } from "@/components/capture/QuickCapture";
import { CommandPalette } from "./CommandPalette";
import { CommandProvider } from "./CommandProvider";
import { MobileHeader } from "./MobileHeader";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import type { ModuleId } from "./modules";

/**
 * The chrome every signed-in module sits inside.
 *
 * This wrapper was copy-pasted into thirteen page files, which is how the shell ended up with
 * nowhere to add phone navigation. It lives here now — and being one seam is also what made
 * replacing the tab strip with a sidebar a change to a single file rather than fourteen.
 *
 * The outer axis is now horizontal: the sidebar is a column beside the content above `md`,
 * and absent below it, where the phone navigates through `MobileHeader` + `MobileNav`
 * instead (`responsive.md` — adaptive, not shrunken; a 48px icon rail on a 390px screen is
 * the shrunken answer).
 *
 * `QuickCapture` keeps the scope the inbox spec chose for it — every signed-in page, never
 * `/login`. It is deliberately *not* in `src/app/layout.tsx`, which would hand it the login
 * page too.
 *
 * `min-h-0` on the content column is what keeps the grid's own `overflow-auto` scroller
 * working: without it a flex child refuses to shrink below its content and the page scrolls
 * instead. `min-w-0` does the same job on the new horizontal axis — a wide grid beside the
 * sidebar would otherwise push the whole layout instead of scrolling inside itself.
 */
export function AppShell({
  active,
  children,
}: {
  active: ModuleId;
  children: React.ReactNode;
}) {
  return (
    <CommandProvider>
      <div className="flex h-full min-h-0">
        <Sidebar active={active} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileHeader active={active} />

          <div className="flex min-h-0 flex-1 flex-col">{children}</div>

          <MobileNav active={active} />
        </div>

        <CommandPalette />
        <QuickCapture />
      </div>
    </CommandProvider>
  );
}
