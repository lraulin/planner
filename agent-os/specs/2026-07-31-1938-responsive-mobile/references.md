# References for Responsive / Mobile

**Status: active**

## Patterns to borrow

### `useSyncExternalStore` with a server snapshot — the model for `useIsCompact`

- **Location:** `src/components/grid/useGridColumns.ts:77-89`,
  `src/components/chooser/useChooserSettings.ts:111-115`
- **Relevance:** `useIsCompact()` has exactly this shape, with `matchMedia` as the external
  store instead of the settings provider.
- **Key patterns:** the snapshot returns a referentially stable primitive so React does not
  loop; the **server snapshot returns the default** — for us, `false`, so SSR renders the
  desktop layout and hydration swaps to compact. Every page is `force-dynamic`, so there is no
  cached HTML to mismatch.

### The shell wrapper that is copy-pasted 14 times

- **Location:** `src/app/outline/page.tsx`, `projects`, `tasks`, `goals`, `wishes`, `day`,
  `day/week`, `schedule`, `schedule/plan`, `schedule/time-chart/[chartId]`, `notes`, `chooser`,
  `settings`, and `src/app/fitness/layout.tsx`
- **Relevance:** `AppShell` replaces all of them. Find them with `grep -rl TabStrip src/app`.
- **Key patterns:** the markup is byte-identical apart from the `active` prop, so the edit is
  mechanical. `src/app/fitness/layout.tsx` is the one place it was already factored out and is
  the model for what `AppShell` should look like.

### Why `QuickCapture` is mounted in `TabStrip` and not the root layout

- **Location:** `src/components/shell/TabStrip.tsx:65-79`, and the reasoning in
  `agent-os/specs/2026-07-30-1018-inbox-quick-capture/plan.md:219`
- **Relevance:** it moves to `AppShell`, which has **identical** scope — every signed-in page,
  never `/login`. Do not "simplify" it up into `src/app/layout.tsx`.

### The drag mechanism that cannot survive touch

- **Location:** `src/components/grid/DataGrid.tsx:436, 480-487` (`armed`), `dropZoneFor()` at
  556-563, `DropLine` at 570-590
- **Relevance:** the reason drag is disabled below `md` rather than adapted.
- **Key patterns:** `draggable` is set only during `onMouseDown` so a permanently-draggable row
  does not steal click-and-drag text selection in the priority/effort/deadline inputs. Also note
  `dropZoneFor` splits a 28px row into before/inside/after thirds — **9px per target**, which is
  a fifth of a fingertip.

### Commands that exist only behind right-click

- **Location:** `src/components/day/DailyItemsGrid.tsx:156-187`,
  `src/components/notes/NotesGrid.tsx:309-343`
- **Relevance:** these are why the long-press menu is mandatory. Day's _Promote to task…_,
  _Move to tomorrow_, _Mark in progress / delegated / deleted_ and _Remove from this day_ have
  no other entry point anywhere in the app.

### Affordances that vanish without hover

- **Location:** `src/components/grid/cells.tsx:356` (deadline cells are
  `[&::-webkit-datetime-edit]:opacity-0` until hover), `cells.tsx:126` (the `⤢` open button
  renders only on the selected row, at ~11×16px), `ColumnHeader.tsx:282` (resize handle is
  `bg-transparent` until hover)
- **Relevance:** each needs a compact-mode counterpart or an explicit decision to drop it.

### Existing breakpoint usage — the only responsive code in the app

- **Location:** `src/components/detail/Drawer.tsx:64` (`w-full sm:w-[90%] md:max-w-[45rem]`),
  `src/components/detail/fields.tsx:72`, `formShared.tsx:56`, `ProjectForm.tsx:176`,
  `TaskForm.tsx:210`, `ItemList.tsx:273`, `TaskFitnessPanel.tsx:65`,
  `QuickCaptureDialog.tsx:137`, `NoteDrawer.tsx:174`, `WeeklyPlanView.tsx:313`,
  `MarkdownEditor.tsx:133`
- **Relevance:** twelve utilities, all in forms and drawers. The form grids already stack
  correctly, so Phase 4's work there is hit-target and font-size compliance, not layout.

### The `h-full` chain that makes the shell work

- **Location:** `src/app/globals.css:99-105` (`body { overflow: hidden }`),
  `src/app/layout.tsx:66-68`, then per view `DataGrid.tsx:349`, `FitnessView.tsx:245`,
  `WeeklyPlanView.tsx:341`
- **Relevance:** `html.h-full` → `body.flex.h-full` → page `flex h-full min-h-0 flex-col` → view
  `flex min-h-0 flex-1 flex-col` → scroller `min-h-0 flex-1 overflow-auto`. There is **no
  `100vh` anywhere**, which is a good starting point — the fix is `dvh` on the root at compact
  widths, not a rewrite. Keep the inner-scroller discipline; the page must never scroll.

### `ModalShell` as the single conversion point

- **Location:** `src/components/detail/ModalShell.tsx`
- **Relevance:** making it a bottom sheet below `md` converts `ConfirmDialog`,
  `ShowFieldsDialog`, `NoteFilterDialog`, `ChooserSettingsDialog`, `NewChildDialog` and
  `QuickCaptureDialog` in one edit.
- **Watch out:** `isModalOpen()` in `src/lib/keyboard.ts` queries
  `[role="dialog"], [role="alertdialog"]` to suppress the global `c` shortcut. The roles are
  wiring — do not drop them while restyling.

### Server actions and the `run()` helper

- **Location:** `src/app/day/actions.ts:16-22`, `src/lib/auth.ts` (`getCurrentUserId`)
- **Relevance:** any new command surfaced by the long-press menu calls an existing action. This
  spec adds no new mutations; if that changes, follow this shape and
  `development/testing.md`'s cross-user integration rule.

## External references

- Apple HIG, _Layout_ — the 44×44pt minimum tap target.
- WebKit's viewport zoom-on-focus behaviour for sub-16px form controls (the reason for the
  global input rule).
- CSS `dvh` / `svh` / `lvh` — why `100vh` sits under Safari's dynamic toolbars.
