# Module consolidation — Shaping Notes

**Status: active**

## Scope

Which destinations are **modules**, now that there is a **Page** tier to hold the ones that
never should have been. Three collapses, one flattening, no new capability.

- Seven Plan modules become seven pages of one `Plan` module.
- Contacts and Resources become two pages of one `Library` module.
- The Time Charts **list** becomes a page of Schedule; its editor stays where it is.
- Sidebar sections are deleted — the flattening is what the collapses make possible.

### Out of scope

- **Any new feature.** No page gains a capability it does not have today, and no grid,
  query or mutation is touched. This is the same class of work as `module-pages`: chrome.
- **A Contexts page.** Master contexts keep `MasterContextsDialog`. Pulling them into
  `/library/contexts` is a real new surface, and it is a later delta if the dialog chafes.
- **A Categories page.** Investigated and there is nothing to build — `category` is a
  free-text field inherited down the tree (`src/lib/tree/types.ts`), not a managed table.
  Recorded because "Categories, Contexts, Resources are all the same kind of thing" is the
  intuition that opened this conversation, and two of the three turn out not to be alike.
- **Merging Task Chooser into Plan.** Considered and rejected below.
- **Splitting Projects / Goals / Result Areas into Views.** Named as the release valve if
  the seven-tab bar reads as cluttered; deliberately not done now.
- **The three week-shaped surfaces** (Calendar at `dayCount 7`, Week Plan, the
  `/schedule/plan` wizard). Still open, still not fixed here.

## Decisions

### Why these seven were never modules

The evidence is in the route files, not in the design argument. `src/app/overview`,
`outline`, `projects`, `tasks`, `goals`, `wishes` and `result-areas` each call the same
`loadOutline(userId)` and differ only in which grid component receives the result. Wishes
adds `loadWishList`, Overview adds `listMasterContexts` and the inbox count. One dataset,
seven presentations — which is what `pages.ts` exists to hold — and Achieve reached them as
sibling tabs behind a single Go-menu entry.

The `module-pages` spec built that tier and converted the four modules that had invented
their own switchers. It did not ask which destinations should be modules at all, so the
sidebar kept spending seven rows and a section heading to say "outline, filtered seven ways".

### Why Task Chooser stays top-level

Taxonomically it is a variant of Tasks and could be Plan's eighth page. Lee's reason for
keeping it out is the right one and is not about taxonomy: it is where you go to decide what
to do next, several times a day, from anywhere. Burying a most-frequently-used destination
one level down to satisfy a category boundary trades daily cost for tidiness.

It also has no outline grid in it. Plan's pages are all the same records drawn differently;
Chooser is a scoring surface with its own settings, and it would be the one tab that did not
belong to the set.

### Why sections go

The navigation spec introduced sections so a sidebar could reach twenty destinations —
_"vertical space is what we have and horizontal space is what ran out"_. Eight built modules
plus three reserved does not need headings.

What forces the decision rather than merely allowing it: after the collapses, **Plan and
Library would each be a section containing exactly one module of the same name**. That is the
same chrome-that-teaches-nothing the page bar's `>= 2` floor already rejects one tier down —
a heading spending a row to say "you are in the only place there is".

Lee chose the flat list over keeping the sections. The cost is that the three reserved
modules lose their declared homes; the reason that cost is acceptable is that a section was
only ever a rendering of `section`, and re-grouping later is a field and a `groupBy`, not a
rebuild. Recorded so nobody reads the deletion as "grouping was a mistake".

### Why Overview becomes Plan's default page

It is the odd one of the seven: a hub with links and an inbox count rather than a grid, and
`/` redirects to it unconditionally today. That made "leave it top-level as the app home" a
real option.

Rejected because the redirect is the better version of what Overview was doing. `/` → `/plan`
lands on `shell.lastPage`, so someone who lives in Tasks gets Tasks and someone who has never
been anywhere gets Overview — which is what the hub is for. Landing on a hub you did not ask
for, every time, is the behaviour the `lastPage` mechanism was built to remove one tier down.

### Why the time-chart editor does not move with its list

`/time-charts` becomes `/schedule/time-charts`. The editor stays at
`/schedule/time-chart/[chartId]` — **singular** — and the near-identical pair is deliberate.

`pageForPathname` matches a declared segment's whole subtree, so if the editor moved under
the plural segment it would resolve to the Time Charts page and the shell would draw the page
bar on it. The editor is a focused flow with its own Back; `navigation.md`'s test is _"in the
bar you leave by tapping a sibling; a focused flow has an exit"_. Keeping the singular segment
undeclared is what keeps the bar off it.

This is a trap for the next reader — two paths one letter apart, and "fixing" the
inconsistency silently breaks a rule — so it gets a comment at the route rather than only
here.

### Why `primary` stops being a boolean on a module

The phone bottom bar's second slot must go to `/plan/tasks` specifically, not to Plan (which
would land on `lastPage` and could open Goals under a button labelled Tasks). A flag on a
module cannot express a page.

`PRIMARY_DESTINATIONS` in `modules.ts` replaces it: an ordered list whose entries name a
module and optionally a page. It lives in `modules.ts` rather than `pages.ts` because the
bottom bar needs icons and `pages.ts` must stay React-free to remain unit-testable — the same
split the page registry already made for the same reason.

It also fixes something the bottom bar was doing wrong. `navigation.md` says never hard-code
a module outside the registry; `MobileNav` hard-coded all three hrefs.

### Why seven tabs is acceptable

Measured rather than assumed: seven labels at `0.8125rem` with `px-2` and `gap-1` come to
roughly 460px, against a desktop content area of 1000px+. Below `md` the bar already scrolls
sideways with 44px targets, which `module-pages` built for exactly this.

If it does read as cluttered in use, the release valve is folding Projects / Goals / Result
Areas into one Items page with Views — they are the same records filtered by type, which is
what a View is. Not done now, because each of them passes the test the page tier is built on:
it is a place you can be, with its own selection and its own scroll position.

## Context

- **Visuals:** None. Both patterns already exist in the codebase — `PageBar` for the seven
  tabs, `Sidebar` minus its `<h2>` for the flat list.
- **References:** See `references.md`.
- **Product alignment:** No roadmap item. This is the navigation debt `module-pages` left
  behind: it built the tier and did not re-sort what belonged in it.

## Standards Applied

- `components/navigation` — the standard being amended, for the third time and at the tier
  it originally defined.
- `components/responsive` — the page bar is the row that survives below `md`; the bottom bar
  keeps three slots and 44px targets.
- `components/ux-principles` — every destination keeps a visible tappable path.
- `development/clean-code` — one shared implementation per concern; the query-preserving
  redirect is extracted rather than copied eleven times.
- `development/testing` — pure logic in `src/lib` with tests, no component tests, and
  `npm run smoke` after touching `src/app/**` (which this does, wholesale).
