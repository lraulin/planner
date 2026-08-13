# References for Module consolidation

**Status: active**

## Governing specs

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends.
- **Carries forward unchanged:** the three-tier vocabulary (Module / Page / View); one page
  registry in `src/lib/navigation/pages.ts` with the accessors in `modules.ts`; the
  underline-tabs-are-navigation rule; the `>= 2` built pages floor; `lastPage` stickiness via
  `moduleEntryRedirect`; and "a focused flow is not a page" with its subtree matching rule.
- **What this spec adds:** nine more pages and no new mechanism. If any part of this needs a
  new concept, that is a signal the collapse is wrong, not that the tier needs extending.
- **The decision worth re-reading:** _"The axis that does carry weight is 'is this a place you
  can be?'"_ It is the test applied to all seven Plan destinations here, and the reason
  Projects / Goals / Result Areas stay separate pages rather than becoming Views.

### `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`

- **Relationship:** Supersedes — the **sections** decision and its section table, only.
- **What it decided:** modules grouped into ordered sections (`Plan` / `Do` / `Track` /
  `Library`), rendered by `sectionsWithModules()` and shared between the sidebar and the More
  sheet, so a section with no built modules stays invisible.
- **Why it is superseded:** sections existed to make a sidebar scale to twenty destinations.
  Collapsing fifteen modules to eight removes that pressure, and would leave Plan and Library
  as sections of one.
- **Everything else stands:** the collapsible sidebar, the `⌘K` palette as Achieve's Go menu,
  one command registry with two renderers, the More sheet, and "no command is palette-only".

### `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/`

- **Relationship:** Supersedes — Time Charts, Resources and Contacts as **top-level modules**,
  and the claim that _"the Library section is now live"_. The Library section becomes the
  Library module.
- **Untouched:** every decision about what those surfaces contain — contacts shaped to the
  Google People API, discussion items as real tasks, contact history as notes, one
  `contact_items` child table, resources feeding the weekly wizard's time budget, and File
  Organizer / Life Plan dropped indefinitely.

### `agent-os/specs/2026-08-09-2133-overview-and-inbox-organizer/`

- **Relationship:** Extends.
- **What changes:** Overview becomes `/plan/overview` and `/` no longer lands on it
  unconditionally — it redirects to `/plan`, which resolves to `shell.lastPage`. Overview is
  still where a session with no history lands, so the hub keeps its job for the reader who
  needs it.
- **Unchanged:** the organizer queue, the inbox count, and `/organize` as a focused flow
  outside the module registry (`active={null}`).

## Reference implementations

### The page registry and its bar

- **Location:** `src/lib/navigation/pages.ts`, `src/components/shell/PageBar.tsx`
- **Relevance:** the two files this spec mostly just adds data to.
- **Key patterns:** `PageEntry` with `status` / `isDefault` / `keywords`; `pageForPathname`'s
  subtree rule; `useRememberPage` writing `lastPage` on arrival rather than on click, which is
  what makes the bare-path redirect work for deep links and Back as well as for tab clicks.

### The bare-path redirect

- **Location:** `src/components/shell/moduleEntry.ts`
- **Relevance:** `/plan` and `/library` are one line each of `moduleEntryRedirect`.
- **Key patterns:** the server-side read of `shell.lastPage` before the first byte (a
  client-side bounce is visible as a flash of the wrong page); `builtPageById` dropping a
  stored id this build no longer builds; and `withQuery`, which this spec extracts because the
  legacy redirects need the same behaviour.

### The legacy-route redirect

- **Location:** `src/app/day/page.tsx`, `src/app/day/week/page.tsx`
- **Relevance:** the precedent for the ten redirects this spec leaves behind, written when Day
  folded into Schedule one spec ago.
- **Key patterns:** a `page.tsx` that is only a `redirect()`, forwarding the query parameter
  that months of links wrote (`?date=`), with a comment saying which links those were. The one
  thing to improve on: it hand-rolls its query forwarding, and eleven copies of that is what
  the extracted helper avoids.

### The palette's generated go-to entries

- **Location:** `src/components/shell/globalCommands.ts`
- **Relevance:** produces `Plan: Tasks`, `Library: Contacts` and `Schedule: Time Charts` with
  no new code, because it already flat-maps modules to their pages.
- **Key patterns:** `GO_KEYWORDS` keyed by module id, merged with `PageEntry.keywords` — which
  is why this spec moves each collapsed destination's search terms down into its page entry
  rather than leaving them on a module id that no longer exists.

### The label resolver

- **Location:** `destinationLabel()` in `src/components/shell/modules.ts`
- **Relevance:** already returns the page label for a paged module and the module label
  otherwise, which is exactly what `MobileHeader` needs once "Plan" would otherwise be the
  title on all seven pages.
- **Key patterns:** naming a destination from the registry rather than from the caller — the
  function exists because a hardcoded `returnTo === "/time-charts" ? … : …` was already wrong
  for one destination. That ternary is also the thing this spec's Time Charts move simplifies.
