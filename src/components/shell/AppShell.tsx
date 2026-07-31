import { QuickCapture } from "@/components/capture/QuickCapture";
import { MobileHeader } from "./MobileHeader";
import { MobileNav } from "./MobileNav";
import { TabStrip } from "./TabStrip";
import type { TabId } from "./tabs";

/**
 * The chrome every signed-in view sits inside.
 *
 * This wrapper was copy-pasted into thirteen page files, which is how the shell ended up with
 * nowhere to add phone navigation. It lives here now: desktop tab strip above `md`, compact
 * header and bottom nav below it, and the view in between.
 *
 * `QuickCapture` moves here from `TabStrip` and keeps the scope the inbox spec chose for it —
 * every signed-in page, never `/login`. It is deliberately *not* in `src/app/layout.tsx`,
 * which would hand it the login page too.
 *
 * `min-h-0` on the content row is what keeps the grid's own `overflow-auto` scroller working:
 * without it a flex child refuses to shrink below its content and the page scrolls instead.
 */
export function AppShell({
  active,
  children,
}: {
  active: TabId;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip active={active} />
      <MobileHeader active={active} />

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      <MobileNav active={active} />
      <QuickCapture />
    </div>
  );
}
