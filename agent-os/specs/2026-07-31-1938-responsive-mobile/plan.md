# Responsive / Mobile (iPhone-first)

**Status: active**  
Spec folder: `agent-os/specs/2026-07-31-1938-responsive-mobile/`

---

## Context

The app is a desktop instrument and reads like one: 13px type, 28px rows, six-column grids,
a right drawer, and an interaction model built on hover, right-click, double-click, HTML5
drag and a document-level keyboard listener. On a phone it is not "cramped" — it is unusable.

The measured starting point:

- **12 Tailwind breakpoint utilities in the entire codebase**, every one of them inside a
  drawer, form or dialog. None in the shell. None in any grid.
- **Zero `@media (max-width: …)` rules.** The only media queries in `globals.css` are
  `prefers-color-scheme` (×2) and `prefers-reduced-motion`.
- **Zero `useMediaQuery` / `matchMedia`** outside one context-menu position clamp.
- `TabStrip` is a single non-wrapping row of 10 tabs plus 3 actions at 13px — it overflows
  below roughly 900px, with no `overflow-x-auto` to catch it.
- Every editable control is 13px, which makes **iOS Safari zoom the viewport on focus and
  never zoom back**.
- The shell wrapper (`flex h-full min-h-0 flex-col` + `<TabStrip>`) is copy-pasted across 14
  files rather than living in a layout.

Meanwhile `agent-os/product/mission.md:32` promises "reachable from phone, tablet, and any
OS," and commit `7877ea4` made the app installable as a PWA (`src/app/manifest.ts`,
`display: standalone`, maskable icons). The install story is half-built: you can put it on
the home screen and then not use it.

Responsiveness appeared nowhere in the roadmap and there was **no styling or responsive
standard at all** — the standards directory covers UX philosophy, drawers, modals, testing,
migrations and the agent API, but nothing about layout, breakpoints, tokens or touch. So this
work is new product intent, and it ships a standard alongside the code.

**Target device: iPhone 12 — 390 × 844 CSS px**, notch and home indicator.

## Scope

| Tier                     | Views                                                                                   | Treatment                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **First-class on phone** | Day, Quick Capture, Tasks, Projects, Goals, Wish List, Notes                            | Designed for touch: card lists, sheets, tap/long-press/swipe |
| **Non-broken**           | Outline, Weekly Schedule, Task Chooser, Week Plan, Planning wizard, Time Chart, Fitness | Degrade gracefully — scroll rather than squash; no redesign  |
| **Unchanged**            | Desktop at `md`+                                                                        | Same layout and density; token/spacing/focus polish only     |

Outline inherits compact rows from the shared `DataGrid` and will be usable on the phone, but
it is not tuned this cycle — a six-column hierarchical tree at 390px is its own project.

### Out of scope

- A desktop redesign. Nav, chrome and grid density at `md`+ stay as they are.
- A theme toggle. Dark mode stays `prefers-color-scheme`-driven.
- Touch-drag reordering (see the decision below).
- Native app packaging beyond the existing PWA manifest.
- Any change to the database, mutations, or the `user_settings` scope keys frozen by
  `2026-07-31-1520-persistent-ui-state`.

## Final decisions

| Decision                   | Choice                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Breakpoint                 | **One line: `md` (48rem / 768px)**. Below = compact/touch; at/above = the instrument                 |
| JS branching               | `useIsCompact()` via `useSyncExternalStore` + `matchMedia`; server snapshot `false`                  |
| Phone navigation           | Bottom tab bar — `Day · Tasks · ＋ · Notes · More` — with a **More** bottom sheet for the rest       |
| Grids on phone             | Card/list rows from one branch in `DataGrid`, driven by a `compact` role on `ColumnDef`              |
| Record editing on phone    | Drawer becomes a **full-screen bottom sheet**; `DrawerFooter` keeps all three buttons, restacked     |
| Dialogs on phone           | `ModalShell` becomes a bottom sheet, so every dialog converts at once                                |
| Double-click / right-click | **Tap** opens the record; **long press** opens the row menu as a sheet                               |
| Drag-to-reorder            | **Off below `md`** — replaced by explicit "Move to…" commands in the long-press menu                 |
| iOS input zoom             | One global rule: `input, select, textarea { font-size: 1rem }` below `md`                            |
| Safe areas                 | `viewport-fit: cover` in the Next `viewport` export + `.pt-safe` / `.pb-safe` / `.px-safe` utilities |
| Soft keyboard              | `interactiveWidget: "resizes-content"`; `visualViewport` only if a surface still misbehaves          |
| Shell                      | Extract the 14 copy-pasted wrappers into `AppShell`; keep `QuickCapture` at the same scope           |

### Why drag is disabled rather than polyfilled

`DataGrid.tsx:436,480-487` arms `draggable` only during `onMouseDown` — a permanently draggable
row would steal click-and-drag text selection inside the priority, effort and deadline inputs.
`onMouseDown` does not reliably fire before a touch drag, so the mechanism is mouse-shaped by
construction, not by accident.

Reordering therefore becomes an explicit command on touch. That is not a downgrade in
capability: the Day tab's A/B/C/D ranking, Chooser's TC Priority, Notes nesting and Outline
reparenting all become named menu items, which are also more discoverable than a gesture.

### Why the long-press menu is mandatory, not a nicety

Two grids carry commands that exist **nowhere else in the UI**, reachable only by right-click:

- `DailyItemsGrid.tsx:156-187` — _Promote to task…_, _Move to tomorrow_, _Mark in progress /
  delegated / deleted_, _Remove from this day_
- `NotesGrid.tsx:309-343` — _New note after_, _New child note_, _Indent_, _Outdent_, _Delete_

Without long-press, the Day tab on a phone can check items off and nothing else.

### Why context preservation is given up below `md`

`ux-principles.md` opens with "never hide the outline unless absolutely necessary," and the
drawer exists to serve it. At 390px there is no arrangement that keeps a grid legible behind a
form worth filling in. The compact layout gives up that principle knowingly and in exactly one
place; `ux-principles.md` and `drawer-pattern.md` were amended to say so rather than leaving
the code silently contradicting them.

## Standards

Shipped with this spec, because the gap was as real as the code gap:

- **New:** `agent-os/standards/components/responsive.md` — the adaptive-not-shrunken rule, the
  single breakpoint, 44px targets, the 16px input rule, safe areas and `dvh`, gesture
  translations, why drag is mouse-shaped, dark mode, overflow, and a verification checklist.
- **Amended `ux-principles.md`:** "Keyboard first" → "Keyboard first on desktop, touch-complete
  on phone"; the accessibility exemption now explicitly **does not** cover hit-target size and
  touch-reachability; grid+drawer notes its compact form; editing triggers gain tap/long-press;
  two rows added to the Decision Guide.
- **Amended `drawer-pattern.md`:** full-screen bottom sheet below `md`; the footer restacks but
  keeps all three buttons.
- **Amended `modal-pattern.md`:** `ModalShell` renders a bottom sheet below `md`; the
  visible-button rule generalises to hover/right-click/double-click.
- `standards/index.yml` rebuilt.

## Phases

Each phase is a reviewable commit. 0–2 are prerequisites; 3–5 are independently shippable.

### Phase 0 — Spec + standards

This document, the standards above, and the roadmap entry.

### Phase 1 — Foundation

- `src/app/layout.tsx` — extend the existing `viewport` export with `viewportFit: "cover"` and
  `interactiveWidget: "resizes-content"`. Never a raw `<meta>`; Next owns that tag.
- `src/app/globals.css` — `--tap-target`, safe-area utilities, `overscroll-behavior: none`,
  `-webkit-text-size-adjust: 100%`, `100dvh` at compact widths, **the 16px input rule**, and the
  light desktop polish (a spacing scale, a stronger `:focus-visible`, an `--elev-1` shadow).

The 16px rule is the single highest-impact line in the change.

### Phase 2 — App shell

- New `src/components/shell/AppShell.tsx` replacing the wrapper copy-pasted across the 14 files
  that `grep -rl TabStrip src/app` finds. `QuickCapture` moves from `TabStrip` to `AppShell` —
  identical scope (every signed-in page, never `/login`), preserving the reasoning in
  `2026-07-30-1018-inbox-quick-capture/plan.md:219`.
- New `MobileNav.tsx` — bottom tab bar, `md:hidden`, `.pb-safe`, five ≥44px slots. `＋` reuses
  the existing `CAPTURE_EVENT` from `src/components/capture/event.ts`.
- New `MoreSheet.tsx` — `ModalShell` sheet listing the remaining tabs, Settings and Log out.
- New `MobileHeader.tsx` — compact sticky top bar with `.pt-safe`: view title + a slot for the
  view's controls. `TabStrip` and `HintBar` hide below `md`.

### Phase 3 — Grids become card lists

- New `src/components/shell/useIsCompact.ts`.
- `src/components/grid/columns.ts` — optional `compact?: "primary" | "meta" | "accent" | "hidden"`
  on `ColumnDef`, with a sensible default derivation so no grid is required to opt in.
- New `src/components/grid/CompactRow.tsx` — priority as a left accent bar, title on line 1,
  meta chips on line 2, `min-height: var(--tap-target)`. Outline and Notes keep their `.spine`
  rails so hierarchy survives.
- `src/components/grid/DataGrid.tsx` — branch the row renderer; tap opens, long-press opens the
  existing `ContextMenu` as a sheet, drag off, header sort/filter/resize desktop-only.
- Pure logic extracted with tests per `development/testing.md`: `src/lib/touch/longPress.ts`,
  `src/lib/touch/swipe.ts`, `src/lib/grid/compactFields.ts`.

### Phase 4 — Drawer, modals, forms

- `Drawer.tsx` full-screen sheet + restacked `DrawerFooter` with `.pb-safe`.
- `ModalShell.tsx` bottom sheet — converts `ConfirmDialog`, `ShowFieldsDialog`,
  `NoteFilterDialog`, `ChooserSettingsDialog`, `NewChildDialog` and quick capture at once. Roles
  unchanged, because `isModalOpen()` in `src/lib/keyboard.ts` queries them.
- `ItemList.tsx:97` — double-click-to-expand gains a visible chevron; today it has **no other
  trigger**.
- `cells.tsx:356` — deadline cells are fully transparent until hover, so on touch the column
  reads as permanently blank; compact mode renders a persistent placeholder.

### Phase 5 — Day, Quick Capture, Notes

- `DayView` three panes → one column with a segmented control (Appointments / **List** /
  Journal). `DailyItemsGrid` compact rows, 24px checkbox, add-row pinned above the nav, swipe
  left = move to tomorrow, swipe right = complete.
- `QuickCaptureDialog` full-screen, 16px textarea, field chips above the keyboard. Enter-submits
  stays for hardware keyboards; the existing **Add** button is the touch path.
- Notes: tap → `NoteDrawer` sheet. It autosaves — **do not add a footer** (`drawer-pattern.md`).

### Phase 6 — Degrade the rest

- Weekly Schedule → `timeGridDay` + a day pager below `md`; hide `ProjectsRail` and `MiniMonth`.
- Chooser, Week Plan, planning wizard, time-chart editor → `overflow-x-auto` with a `min-width`
  and a one-line "best on a larger screen" note.
- Fitness picks up `AppShell`.
- `TimeChartEditorView.tsx:284` — replace the raw `window.confirm` with `ConfirmDialog` (an
  existing `modal-pattern.md` violation, fixed while we are in the file).

## Acceptance criteria

Verified at 390 × 844 with touch emulation via the `run-planner` driver's new `viewport` and
`scheme` steps, unless noted.

- [x] No horizontal scroll on the page body — measured `documentElement.scrollWidth -
innerWidth === 0` on all thirteen routes.
- [x] **Focusing any input does not zoom the viewport** — zero controls below 16px on any
      route, including all 18 inside the node drawer.
- [x] Bottom nav present below `md`; all five slots measure 78 × 48px; `.pb-safe` clears the
      home indicator.
- [x] Tasks / Projects / Goals / Wishes / Notes render as card lists; tap opens the full-screen
      sheet; the footer restacks with all three buttons.
- [x] Day: segmented control switches panes; check boxes are tap-sized; the add row commits on
      Enter; swipe right completes and swipe left moves to tomorrow (both driven through
      synthesised pointer events and confirmed against the stored state).
- [x] Every command in the Day and Notes row menus is reachable by long press, and A/B/C/D
      ranking exists there as named commands now that drag is off.
- [x] Quick capture opens from the `＋` slot and submits by button; Enter inserts a newline
      below `md` rather than submitting.
- [x] Both colour schemes checked on the touched surfaces.
- [x] Schedule renders a single day with a pager; Week Plan, planning wizard and time chart pan
      inside `WideSurface` rather than squashing; Chooser inherits compact rows.
- [x] **Desktop regression pass at 1280 × 800** — 28px rows, grid template columns intact,
      `HintBar` and `TabStrip` visible, bottom nav hidden, `F2`, arrow-key selection,
      right-click menu (11 items) and HTML5 drag all still working; Schedule still 7 columns
      with its rail.
- [x] `test:unit` (680), full `test` including the Postgres integration suite (964, 64 files —
      not skipped), `typecheck`, `lint` and `build` all pass.
- [ ] **Open:** verify in the installed PWA on the actual iPhone 12. Emulation cannot show
      Safari's dynamic toolbars, real notch insets, or the soft keyboard's effect on the
      sticky drawer footer. This spec stays **active** until that run.

## Changes from original plan

| Change                                                                                                                                                                                                                         | Why                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 dropped the planned `--space-*` scale and the "stronger `:focus-visible` ring"                                                                                                                                         | A token scale nothing consumes is dead CSS, and re-tuning the focus ring risks a desktop regression for no mobile gain. The desktop polish that survived is `--elev-1` (used by pinned chrome and sheets).                                 |
| Phase 1 added `-webkit-tap-highlight-color: transparent` and a `.md-body` bump to 16px below `md`, neither of which was planned                                                                                                | Both are real touch polish found while writing the compact block: the grey tap flash reads as a rendering fault, and 14px prose is a desktop compromise on the one surface meant for reading.                                              |
| Phase 3 added `--name-gutter` and `formatCompactDate`, neither of which was planned                                                                                                                                            | The meta line sat 42px left of the title it belonged to, because the name cell's expander and icon are inside the primary slot. And `deadline`'s only borrowable text was its filter's ISO string, which is the wrong shape for a chip.    |
| Phase 3 made `TabToolbar` scroll sideways below `md`                                                                                                                                                                           | Not in the plan, but the wrapped toolbar was costing four rows — a fifth of a 390px screen — before a single task was visible.                                                                                                             |
| **Phase 4 dropped two planned items.** `ItemList` already has a visible ▼ expand button beside the double-click; and the hover-only deadline cell never renders below `md`, because that column becomes a read-only meta chip. | The shaping notes over-reported both. `ItemList` instead got tap-to-expand on the row and 44px-tall row buttons; the deadline cell needs no change at all.                                                                                 |
| Phase 4's footer restacks with `flex-col-reverse` rather than rendering Save twice                                                                                                                                             | Two copies hidden per breakpoint would put two identical controls in the tree and in every query written against it.                                                                                                                       |
| Phase 5 added a `leading` compact role and swipe support in `DataGrid`, neither planned in that shape                                                                                                                          | The Day tab's check box is the reason to open it on a phone, and compact rows otherwise render text only. Swipe took the same opt-in shape as `rowDrag`, so it stays contained to the grid that asks for it.                               |
| Phase 5 also added A/B/C/D "Rank …" commands to the Day row menu                                                                                                                                                               | Follows from drag being off on touch. The plan asserted ranking must survive but did not schedule the commands that make it survive.                                                                                                       |
| Phase 6 introduced `WideSurface` instead of ad-hoc `overflow-x-auto` per view                                                                                                                                                  | Three views needed the same "keep your width, pan, and say why" treatment. Three hand-rolled copies would drift like the four backdrops `ModalShell` was extracted from.                                                                   |
| Phase 6's compact Schedule opens on today rather than the week's first day                                                                                                                                                     | Landing on Sunday because that is where the week starts is technically correct and never what was wanted.                                                                                                                                  |
| Phase 6 hid `HintBar` and made the Outline, Schedule and planning toolbars scroll                                                                                                                                              | Not planned. `HintBar` documents keys, drag and right-click — none of which a phone has — and was costing 180px of 844.                                                                                                                    |
| The `run-planner` driver gained `viewport` and `scheme` steps                                                                                                                                                                  | Verifying any of this at 390 × 844 was otherwise impossible. Note the gotcha it exposed: `Emulation.setTouchEmulationEnabled` kills HTML5 drag and turning it back off does not revive it, so the driver only toggles it on a real change. |
