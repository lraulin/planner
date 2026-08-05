# Navigation & Commands

> For the philosophy these rules serve, see `ux-principles.md`. For how each surface
> reshapes below the breakpoint, see `responsive.md`.

Achieve Planner reached all sixteen of its views through the **Go** menu, and kept only the
ones you had opened as tabs. We inherited the tabs without the Go menu, so every view had to
be a permanent tab and the eleventh was already too many.

Three surfaces now, each answering a different question.

| Surface                      | Question it answers             | Where                |
| ---------------------------- | ------------------------------- | -------------------- |
| **Sidebar** (`⌘K` to search) | "Where can I go?"               | Desktop, always      |
| **Command palette** (`⌘K`)   | "What can this app do?"         | Desktop, on demand   |
| **`⋯` overflow**             | "What _else_ can this view do?" | Every view's toolbar |

Below `md` the sidebar is replaced by the bottom nav plus the More sheet, and there is no
palette at all — `⋯` is the whole command surface. See `responsive.md`.

## Views live in one registry

`src/components/shell/views.ts` is the only list of views. It is read by the sidebar, the
phone bottom nav, the More sheet, the phone header's "you are here" title, and the palette's
go-to entries.

**Never hard-code a view anywhere else.** Five surfaces reading one array is what stops the
phone and the desktop from disagreeing about what the app contains — the previous version of
this file was four surfaces reading `TABS`, and that was already the reason it worked.

### Sections, and reserved views

Views are grouped into ordered sections (`Plan`, `Do`, `Track`, `Library`). Both the sidebar
and the More sheet render `sectionsWithViews()`, so the two group the app identically.

A view we have decided the home of but not built is marked `status: "reserved"`. It renders
nowhere and is not a navigation target; a section holding only reserved views does not render
at all.

- **Do** decide a future view's section when you know it. It costs a line and it stops the
  next person re-arguing navigation.
- **Do not** render a reserved view as a disabled or "coming soon" entry. A menu full of dead
  rows teaches the reader to stop reading the menu, and then the live rows stop working too.

## Commands live in one registry

`src/lib/commands/registry.ts` defines what a command is. A view publishes its own with
`useRegisterCommands` and both renderers read them through `useCommands`.

**One registry, two renderers.** A command described in two places is a command whose two
descriptions eventually disagree about whether it is available or what it is called.

### No command is palette-only

`ux-principles.md`: _a gesture nobody can see is not a discoverable action_ — and there is no
`⌘K` on a phone. Every command must have a visible, tappable path, which in practice means
`⋯` unless it already has its own button.

This is the rule that makes the palette legal. Adding a command to the palette alone is not
shipping it; it is shipping it for the one person who already knew it was there.

### Complete palette, short menu

`hasOwnControl: true` marks a command that already has a button on the bar. The palette still
lists it; `⋯` skips it.

The two surfaces are answering different questions and want different lists:

- The **palette must be complete.** A Go menu that omits things is one you stop trusting, and
  then you stop opening it.
- **`⋯` must be short.** Reprinting `Filter…` and `Open` directly beneath the Filter and Open
  buttons is exactly the toolbar clutter the overflow tier exists to remove.

### Unavailable is not absent

A command that cannot run right now — nothing selected, no groups to collapse — is
`disabled`, not filtered out, with `title` saying why. A command that vanishes teaches you it
does not exist; a greyed one with "Select a row first" teaches you how to use it.

### Where a control belongs

Three tiers, and a control should sit in the lowest one that still works:

| Tier               | For                                                                  |
| ------------------ | -------------------------------------------------------------------- |
| **On the toolbar** | Used most sessions, or required visible (`Rename`, `Open`, `Filter`) |
| **Behind `⋯`**     | Real commands used occasionally (`Show Fields`, `Reset this grid`)   |
| **Palette only**   | Nothing. See above.                                                  |

`data-grid.md`'s toolbar tests still apply first: a control that is a column filter wearing a
checkbox, or whose only two states are "unavailable" and "duplicated", does not belong in any
of the three tiers — it belongs deleted.

## Shell state is a setting, not a `localStorage` flag

The sidebar's collapsed state lives in `user_settings` under the `shell` scope, because it is
the first thing painted. Settings load server-side in `src/app/layout.tsx` precisely so a
stored preference arrives in the first HTML; a rail that renders expanded and then snaps shut
on every navigation is the most visible possible version of the flash that decision exists to
prevent.

Anything else the shell remembers goes in the same scope, and its parser must return defaults
for an unusable blob rather than throwing. It runs before the first paint: an exception there
does not break one grid, it breaks the app.

## Events, not a provider, for "open this"

The palette and the capture dialog own their own open state. The buttons that open them are
siblings, not descendants, so they dispatch a `window` event (`shell/commandEvent.ts`,
`capture/event.ts`) rather than forcing a provider into the root layout — which would also
hand the surface to `/login`, where it does not belong.

The keyboard shortcut is _not_ a dispatch of that event. `⌘K` and `c` are document listeners
inside their own components, because they need the `isTypingTarget` and `isModalOpen` guards
from `src/lib/keyboard.ts`, and those belong with the component that knows what it is doing.

## Testing

The registry's matching and merging, and the shell settings codec, are pure and live in
`src/lib/` with tests. The sidebar, palette, provider and overflow button are wiring and get
none — `testing.md`. Verify them in a real browser via the `run-planner` skill.
