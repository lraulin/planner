import { Suspense } from "react";
import { QuickCapture } from "@/components/capture/QuickCapture";
import { CommandKeys } from "./CommandKeys";
import { FileCommands } from "./FileCommands";
import { ApplicationMenu } from "./ApplicationMenu";
import { PageBar } from "./PageBar";
import { CommandPalette } from "./CommandPalette";
import { CommandProvider } from "./CommandProvider";
import { RowClipboardProvider } from "@/components/grid/RowClipboardProvider";
import { CommandsPanel } from "./CommandsPanel";
import { MobileHeader } from "./MobileHeader";
import { MobileNav } from "./MobileNav";
import { NavigationFreshness } from "./NavigationFreshness";
import { NavigationSurface } from "./NavigationSurface";
import { Sidebar } from "./Sidebar";
import { RemindersPanel } from "@/components/reminders/RemindersPanel";
import { RemindersProvider } from "@/components/reminders/RemindersProvider";

/**
 * The chrome every signed-in module sits inside.
 *
 * This wrapper was copy-pasted into thirteen page files, which is how the shell ended up with
 * nowhere to add phone navigation. It lives here now — and being one seam is also what made
 * replacing the tab strip with a sidebar a change to a single file rather than fourteen.
 *
 * **It is rendered once, by `src/app/(shell)/layout.tsx`**, not by pages. Next keys every route
 * segment, so a shell rendered by each page was unmounted and rebuilt on every navigation —
 * sidebar, menu bar, page bar and command provider included. Above the pages it persists, and
 * `children` is the only thing that changes. Nothing is passed down about *where* you are: the
 * surfaces that need it read the pathname (`useActiveModule`), which cannot disagree with the
 * address bar the way a hand-passed prop eventually did.
 *
 * Consequence worth knowing: everything in here now outlives a navigation. State that used to
 * be cleared by the remount has to be cleared on purpose (see `PageBar`'s arrange mode); the
 * row clipboard, which was documented as surviving a navigation, finally does.
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
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <CommandProvider>
      <RowClipboardProvider>
        {/*
          Reminders sit inside the command provider (they register View ▸ Reminders) and above
          both of their bells — the menu bar's on desktop and the header's on the phone.
        */}
        <RemindersProvider>
          <div className="flex h-full min-h-0">
            <Sidebar />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <MobileHeader />

              {/*
              Application menu above the page bar: the catalog belongs to the app, not the
              current tab (`navigation.md`). `ApplicationMenu` hides itself on focused flows.
            */}
              <ApplicationMenu />

              {/*
              Here rather than inside each module for the same reason the sidebar is: five
              surfaces reading one registry is what stops them disagreeing, and the four modules
              that grew their own switcher grew three different ones. `PageBar` returns `null`
              for a module with fewer than two built pages, so most of the app pays nothing.

              The boundary is for `useSearchParams`, which the bar uses to carry the query across
              a page switch. Every route is `force-dynamic`, so the fallback is theoretical — but
              the bailout it guards against is a build-time error, not a runtime one.
            */}
              <Suspense fallback={null}>
                <PageBar />
              </Suspense>

              {/*
              The content area. Owns the drawer's containing block and the slow-navigation bar
              (`NavigationSurface`); the page is its only child.
            */}
              <NavigationSurface>{children}</NavigationSurface>

              <MobileNav />
            </div>

            {/*
          The Commands panel is a column of this row, on the far edge from the sidebar — the two
          rails frame the grid the way Achieve's did. Here rather than in each module page because
          it reads `useCommands()`, and one mount gives all sixteen modules the panel at once,
          including the four with hand-rolled toolbars.

          The detail drawer overlays it rather than sitting beside it. That is fine and deliberate:
          the drawer is a modal surface about one record, and two 208px+ panes competing for the
          right edge would leave the grid nothing.
        */}
            <CommandsPanel />

            <NavigationFreshness />
            <FileCommands />
            <CommandKeys />
            <CommandPalette />
            <QuickCapture />
            <RemindersPanel />
          </div>
        </RemindersProvider>
      </RowClipboardProvider>
    </CommandProvider>
  );
}
