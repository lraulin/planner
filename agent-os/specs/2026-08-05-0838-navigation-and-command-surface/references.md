# References

**Status: frozen / complete** (2026-08-05)

## In this codebase

### The list that already feeds four surfaces

- **Location:** `src/components/shell/tabs.ts`
- **Relevance:** The thing being replaced, and the pattern being kept. Its header comment —
  _"One list, read by four surfaces that must not drift"_ — is exactly the contract the new
  `views.ts` and the command registry both inherit. `primary` (the phone bottom-nav flag)
  survives unchanged; `section` and `status` are what get added.
- **Consumers to update:** `TabStrip.tsx` (deleted), `MobileNav.tsx`, `MoreSheet.tsx`,
  `MobileHeader.tsx`.

### The menu primitive the overflow button should reuse

- **Location:** `src/components/grid/ContextMenu.tsx`
- **Relevance:** Already solves everything the `⋯` menu needs — arrow / Home / End keyboard
  navigation skipping separators and disabled rows, a right-aligned shortcut column,
  destructive styling, measure-then-position with upward flip near the bottom edge, and
  close-on-scroll that skips the scroll the menu itself causes.
- **Key patterns:** its `MenuItem` type is close to what a rendered `Command` needs, so the
  registry's shape should be chosen to map onto it cleanly rather than inventing a parallel
  item type. Note the `stopImmediatePropagation` comment — App Router hydrates on `document`,
  so `stopPropagation` alone does not cancel sibling listeners. The palette will hit the same
  wall.

### The app-wide shortcut that `⌘K` must coexist with

- **Location:** `src/components/capture/QuickCapture.tsx`, `src/lib/keyboard.ts`
- **Relevance:** The only existing handler not owned by the surface it fires on, and it
  documents how it copes: `isTypingTarget(event.target)` plus `isModalOpen()`. `⌘K` needs the
  same two guards, and the two shortcuts must not fight — `c` is a bare letter, `⌘K` is
  modified, so they do not collide, but both must decline while a dialog is open.
- **Key patterns:** the dialog is unmounted rather than hidden so Escape discards the draft.
  The palette does the same with its query.

### A singleton settings scope, end to end

- **Location:** `src/lib/settings/drawer.ts`, `src/lib/settings/scopes.ts`
- **Relevance:** The template for the new `shell` scope. `drawer` is unkeyed (absent from
  `KEYED`), has a `DRAWER_SCOPE` constant, a `KIND_LABELS` entry so the reset page can label
  a row it did not author, and a `parse*` that drops junk rather than throwing.
- **Key patterns:** `parseDrawerSettings` returns defaults for an unrecognisable blob and
  filters keys it does not know. `serialize*` stamps `SETTINGS_VERSION`.

### Server-rendering persisted UI state without a flash

- **Location:** `src/app/layout.tsx` (`loadSettingsForSession`, `SettingsProvider`)
- **Relevance:** The reason the sidebar's collapsed state goes in `user_settings` rather than
  `localStorage`. The comment there states the rule: settings load once in the root layout
  because _"the server render is the only read path — delivering them in the first HTML is
  what keeps a saved column layout from flashing the default one first."_
- **Key patterns:** `useSetting(scope, codec)` for reads and writes;
  `useResetScope()` (added by the saved-views spec) for clearing another scope.

### The toolbar being decluttered

- **Location:** `src/components/grid/GridToolbar.tsx`
- **Relevance:** Where `⋯` lands, and the source of the clutter half of this spec. Note
  `rowActions` — the existing precedent for "a tab declares it has a selection rather than
  assembling two buttons", which is the same move the command registry makes at app scale.
  The inline comment explaining why `Clear filters` was deleted is the reasoning to apply
  when deciding what goes behind `⋯`.

### The shell seam

- **Location:** `src/components/shell/AppShell.tsx`, plus fourteen `active=` call sites
- **Relevance:** Every signed-in page already routes through one wrapper, so the sidebar can
  be added in one place. Its header comment records that this wrapper was once copy-pasted
  into thirteen page files — which is why phone navigation had nowhere to go. The same seam
  is now what makes this change cheap.
- **Note:** `src/app/settings/page.tsx` deliberately does _not_ use `AppShell`; it hand-rolls
  a slim header and links back to `/outline`. Decide during Task 2 whether it joins the
  sidebar or keeps its own chrome.

## Prior specs

- **`2026-07-28-1121-main-grid-tabs`** — where the tab strip and the four list tabs
  originated.
- **`2026-08-04-0924-grid-control-surface`** — established "a tab declares what it has; the
  shared toolbar supplies how you control it". The command registry is that principle moved
  up a level, from grid controls to app commands.
- **`2026-08-04-2330-next-actions-and-tab-review`** — the toolbar-restraint pass that
  consolidated Rename / Open into `rowActions` and deleted `Clear filters`. Its findings
  table is the model for judging what belongs behind `⋯`.
- **`2026-08-05-0230-saved-views`** — most recent settings-scope work; source of
  `useResetScope()` and the id-must-survive-`parseScope` constraint.

## Achieve Planner reference

- **`docs/achieve-planner/user-manual.md` §1.3** — _"You can access all the tabs using the Go
  menu. If a tab is not already displayed, the Go menu will display it and navigate to it,
  otherwise it will just become the active tab."_ The sentence this whole spec turns on: Go
  was the navigation, tabs were the working set.
- **§1.3 tab list** — the full sixteen: Overview, Outline, Result Areas, Projects, Tasks,
  Weekly Schedule, Task Chooser, Notes, Contacts, File Organizer, Resources, Time Charts,
  Wish List, Goals (plus Life Plan, §7.1). The source for the reserved sections.
- **Menu commands needing a home**, gathered from the manual: `Actions → View Tasks` (Ctrl+T)
  / `View Project` (Ctrl+Shift+J) / `Switch Project` / `Schedule Block` / `Set Project` /
  `Convert to Task` / `Convert to Project` / `Set Recurrence` / `Skip Recurrence` /
  `New Project from Template` / `Reschedule` / `New Appointment`; `View → Customize Current
View` / `Project Explorer`; `Tools → Options`; `Outline →` expand / collapse to level.
  Only the ones already implemented are wired in this spec.

## Design sketches

Shaping used ASCII rather than image mockups. The chosen desktop layout:

```
┌──────────────┬──────────────────────────────────┐
│ Planner   ⌘K │  (view content — no title bar)   │
│              │                                  │
│ PLAN         │                                  │
│  Outline     │                                  │
│  Goals       │                                  │
│  Projects    │                                  │
│ ▸Tasks       │                                  │
│  Wish List   │                                  │
│              │                                  │
│ DO           │                                  │
│  Day         │                                  │
│  Chooser     │                                  │
│  Schedule    │                                  │
│              │                                  │
│ TRACK        │                                  │
│  Metrics     │                                  │
│  Fitness     │                                  │
│  Notes       │                                  │
│              │                                  │
│ ⚙ Settings   │                                  │
└──────────────┴──────────────────────────────────┘
  « collapses to a 48px icon rail
```

The `⋯` menu, on the view's own toolbar:

```
Toolbar:  [View ▾] [Filter] [Group] [Dense]   [⋯]
                                               │
                        ┌──────────────────────┴──┐
                        │ Rename            F2    │
                        │ Open              ⏎     │
                        │ ───────────────────────  │
                        │ Show Fields             │
                        │ Reset this grid         │
                        └─────────────────────────┘
```
