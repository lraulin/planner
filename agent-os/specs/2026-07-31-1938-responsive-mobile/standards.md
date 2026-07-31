# Standards for Responsive / Mobile

**Status: active**

Unusually, this spec **writes** a standard as well as being governed by them. Rather than
inlining full text that this spec is concurrently editing — which would go stale the moment
Phase 0 landed — each section below states what applies, quotes the load-bearing lines, and
points at the file. Read the files for the current text.

---

## components/responsive — NEW, shipped by this spec

**File:** `agent-os/standards/components/responsive.md`

**Why it exists:** the standards directory covered UX philosophy, drawers, modals, testing,
migrations and the agent API — and nothing about layout, breakpoints, tokens, touch or
viewports. There was no written rule to violate, which is why the app drifted to twelve
breakpoint utilities and zero max-width media queries without anyone noticing.

It is the governing document for every phase of this spec. The rules that most constrain the
implementation:

- **One breakpoint: `md` (48rem).** No per-component breakpoints. Branch in JS with
  `useIsCompact()`, never `window.innerWidth`, never a user-agent string.
- **44×44px minimum tap target below `md`**, via `--tap-target`. The desktop 28px row, 16px
  chevron, 10px funnel, 4×16px resize handle and 14px checkbox are correct on desktop and
  **must not be reused** in a compact layout.
- **≥16px font-size on every focusable input below `md`**, handled centrally in `globals.css`.
  Not a preference — iOS Safari zooms on focus below 16px and never zooms back.
- **Never `100vh`**; `dvh`/`svh` only. Safe-area padding via `.pt-safe` / `.pb-safe` /
  `.px-safe`, never inline `env()`.
- **Nothing reachable only by hover, right-click, double-click, or a keyboard shortcut.**
- **Tap replaces double-click; long press replaces right-click; swipe is for reversible
  actions only** and must not fight vertical scroll.
- **Drag-to-reorder is off below `md`** — add the command, not a polyfill.
- Wide content scrolls inside its own container; the page body never scrolls horizontally.

---

## components/ux-principles — AMENDED by this spec

**File:** `agent-os/standards/components/ux-principles.md`

**Why it applies:** it is the arbiter for every surface decision, and two of its Core
Principles pointed the wrong way for touch.

**What was amended and why:**

| Before                                                                                     | After                                                                                                                                | Why                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| "**Keyboard first** — anything reachable by mouse should be reachable by key"              | "**Keyboard first on desktop, touch-complete on phone**" — below `md`, every action needs a tappable path                            | The original is right at the desk and unachievable on a phone; as written it licensed shortcut-only affordances |
| "**Accessibility is not a goal here** — skip ARIA, contrast ratios, screen-reader testing" | Same, plus: **hit-target size and touch-reachability are not covered by this exemption**                                             | 44px targets are usability for the one real user on his real phone, not compliance for a hypothetical audience  |
| "Grid + drawer is the default"                                                             | Plus: below `md` this is **list + full-screen sheet**, and "never hide the outline" is knowingly given up there                      | At 390px no arrangement keeps a grid legible behind a usable form. Better said out loud than silently violated  |
| Editing triggers: `Enter` / double-click → drawer, `F2` → rename                           | Plus: **tap** → record, **long press** → row menu, below `md`                                                                        | Translations of the same bindings, not a second set to learn                                                    |
| Decision Guide                                                                             | Two rows added: viewport below `md`; and "only reachable by hover / right-click / double-click / a shortcut → it is broken on touch" | Makes the new rules reachable from the table people actually consult                                            |

**Unchanged and still binding:** modals only for destructive confirmation, blocking decisions
and fast capture; never a modal for editing a record that has an id; inline editing for any
field that is a grid column; rollup cells read-only; tabs for sections of one record's form;
minimise required fields; allow partial saves; validate on blur; never disable Save.

---

## components/drawer-pattern — AMENDED by this spec

**File:** `agent-os/standards/components/drawer-pattern.md`

**Why it applies:** the drawer is the record-editing surface on every first-class mobile view,
and this is the one standard that already had a responsive rule —
`w-full sm:w-[90%] md:max-w-[45rem]`, which the code has followed since day one.

**Amended:** below `md` the drawer is a **full-screen sheet entering from the bottom** at
`100dvh`, with a tap-sized close button and no visible backdrop. `DrawerFooter` restacks —
Save & Close full-width on top, Save and Cancel beneath, `.pb-safe` to clear the home indicator.

**The rule that does not bend:** the button set is fixed. _"Never invent a different button
set."_ Restacking is arrangement; dropping Save to save room on a phone is not allowed. Nor is
adding a Save button to an autosave drawer — `NoteDrawer` and `SessionEditor` stay footerless
on mobile too.

Also still binding: guard the content not the container; every leave path shares the
dirty-aware handler; never close over a failed save; `prefers-reduced-motion` is handled
globally, so the bottom-sheet transition must not be reintroduced inline.

---

## components/modal-pattern — AMENDED by this spec

**File:** `agent-os/standards/components/modal-pattern.md`

**Why it applies:** the `MoreSheet`, the long-press row menu, and the compact form of every
existing dialog all go through `ModalShell`.

**Amended:** below `md`, `ModalShell` renders a **bottom sheet** — bottom-anchored, rounded top
corners, `max-h-[85dvh]` with internal scroll, `.pb-safe`. Done once in the shell, so all six
dialogs convert together. The visible-button rule is cross-referenced to `responsive.md`, which
generalises it to hover, right-click and double-click.

**The trap to avoid:** `isModalOpen()` in `src/lib/keyboard.ts` finds dialogs by
`[role="dialog"], [role="alertdialog"]`. Those roles are **wiring, not decoration** — drop one
while restyling and the global `c` shortcut opens quick capture on top of an open dialog.

**Also still binding:** no toasts. There are none in the app, deliberately, and a feedback
convention should be chosen app-wide rather than introduced by whichever feature wanted one
first. A mobile overhaul is a tempting place to reach for one; it is out of scope here.

---

## development/testing

**File:** `agent-os/standards/development/testing.md`

**Why it applies:** it says **React components are not tested** — there is no testing-library
setup and adding one is "not currently worth it." So a UI overhaul of this size ships with **no
automated regression net**, and that shapes both the plan and the verification.

Two consequences:

1. **Extract the logic that can be silently wrong.** A long-press slop threshold, a swipe
   axis-lock, and the derivation of which columns become the compact meta line are all pure
   functions that would fail on a plausible mistake and look fine in review. They live in
   `src/lib/touch/longPress.ts`, `src/lib/touch/swipe.ts` and `src/lib/grid/compactFields.ts`
   with tests beside them — not inline in a component where nothing can reach them.
2. **The manual pass is the gate**, not a formality. `responsive.md` ends with the checklist;
   the desktop re-check at 1280×800 is the step most likely to be skipped and most likely to
   catch something.

No database work in this spec, so the cross-user integration rule does not bite — but note that
it would the moment a long-press command needs a new mutation.

---

## Prior specs that constrain this one

### `2026-07-31-1520-persistent-ui-state` (frozen)

Column set, order, **widths**, group collapse, filters, sort, sub-view and drawer active tab all
live in `user_settings` under per-view scope keys (`grid:tasks.active-status`,
`grid:chooser.best-overall`, single-scope for Outline/Notes/Wishes/Day). **This spec must not
restructure or rename those scopes.** Compact mode is a render branch over the same persisted
column state — it reads which columns are visible; it does not write a second layout.

### `2026-07-30-1018-inbox-quick-capture` (frozen)

`QuickCapture` is mounted in `TabStrip`, deliberately not in `src/app/layout.tsx`, because every
signed-in page renders the tab strip and `/login` does not. `AppShell` has identical scope, so
the move preserves the decision rather than overturning it.

### `2026-07-28-1234-weekly-schedule` (frozen)

Established full-page sub-routes over new top-level tabs when a surface needs the whole week
("a top-level tab would clutter chrome"). The bottom nav's **More** sheet is the compact
equivalent of that restraint — five slots, everything else one tap deeper.
