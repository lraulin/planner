# UI/UX Design Principles

The design philosophy behind our component patterns. Read this before the
implementation-focused standards (`drawer-pattern.md`) — it explains _why_ those patterns
exist.

Adapted from the same standard in Lee's `wrcs/reactwrcs` project, where these principles
emerged from iterating through grid → tabs → modals → grid+drawer during 2025–2026. They
align with patterns used in Linear, Supabase, Retool, and other modern tools. Where this
document differs from the original, it is because Achieve Planner's model differs — see
**Tabs** below.

## Core Principles

- **Context preservation** — never hide the outline unless absolutely necessary. It is the
  user's map of everything they have committed to; losing sight of it is disorienting.
- **Consistency** — the same patterns across every view, and aligned with conventions users
  already know from elsewhere.
- **Clarity over cleverness** — if users have to guess how to do something, the design has
  already failed.
- **Error prevention > error recovery** — make dangerous or irreversible actions hard to do
  by accident.
- **Progressive disclosure** — show only what's needed now; hide complexity until relevant.
- **Immediate, clear feedback** for every action.
- **Keyboard first on desktop, touch-complete on phone** — this app replaces a keyboard-driven
  Windows tool. At `md` and above, anything reachable by mouse should be reachable by key, and
  the primary workflows should be faster by keyboard than by mouse. Below `md` that inverts:
  every action must have a visible, tappable path, because there is no keyboard, no hover and
  no right button. Neither half is optional — a shortcut with no button fails on the phone, and
  a button with no shortcut fails at the desk. See `responsive.md`.
- **Accessibility is not a goal here** — one user, no screen reader, not public. Skip ARIA
  coverage, contrast ratios and screen-reader testing; add them if this is ever released.
  Keep the handful of roles and labels that are load-bearing for other reasons (see
  `modal-pattern.md`) — they are wiring, not compliance.
  **Hit-target size and touch-reachability are not covered by this exemption.** A 44px tap
  target and a tappable path to every command are usability for the one user we have, on the
  phone he actually owns — not compliance for a hypothetical audience.
- **Performance is UX** — slow expand/collapse or heavy re-renders destroy usability in a
  dense grid.
- **Forgiveness & safety** — let users recover easily; never force inaccurate data entry.

## Layout & Navigation

### Getting between views, and finding commands

A collapsible **sidebar** for where you can go; a **menu bar** (File leftmost) as the
complete catalog of what you can do, sitting **above the page bar** as application chrome;
an **icon row** of page verbs; a **lens** (filter, search, grouping) immediately above the
grid — not a 2000s toolbar glued to the menu; a pinnable **Commands panel** as that same
tree left open; a `⌘K` **palette** as the searchable overlay (plus Go-to). Below `md`,
**`⋯` is the menu bar**, on the shell. Views and commands each live in exactly one
registry. Full rules, including why a command without a menu row is not shipped:
**`navigation.md`**.

### Grid + drawer is the default

The **outline grid + right-sliding drawer** is the standard pattern for list + form work
(see `drawer-pattern.md`):

- **Grid** for scanning, filtering, reordering, and fast inline edits
- **Drawer** for the full record — the grid stays visible, preserving context

Below `md` this becomes **list + full-screen sheet**. Context preservation is the principle the
drawer serves, and on a 390px screen it is unaffordable — there is no room to keep the grid
visible and still show a form worth filling in. The compact layout gives up that principle
knowingly, in the one place where the alternative is worse. Everything else on this page still
applies. See `responsive.md`.

### Inline editing for grid-visible fields

Fields that appear as grid columns — name, priority, effort, deadline, state, focus — are
edited **in place**. Opening a drawer to change a priority would be absurd. The drawer is
for the fields that don't fit on a row.

Where a value is a rollup of its descendants (a parent's effort), the cell is **read-only**.
Never offer an editor whose result would be invisible behind a computed value.

### Sorted grids: do not move the world while the user is still typing

**Context preservation applies inside a grid row too.** If the user is mid-edit, the row
must stay put. Re-sorting (or re-filtering) the moment a sort-key column changes under the
cursor is classic poor UX: they lose their place, can't finish the value, and the interface
feels hostile.

Rules:

1. **Commit on finish, not on every intermediate change.**  
   Buffer the editor in local state. Write to the model on **blur**, **Enter**, or an
   explicit Accept — not on each keystroke and not on each partial date-picker step.
2. **Defer re-sort until the edit session ends.**  
   While any cell in the sorted grid (or tracking table) has focus, freeze the on-screen
   row order. After focus leaves the grid, re-apply sort. Optional later polish: animate
   the row to its new place or offer a manual “Re-sort” control; never jump mid-edit.
3. **Date pickers: month/year navigation is not a commit.**  
   Changing month or year is exploratory. Only a complete day selection, Accept, or blur
   of a finished value should update storage. With native `type="date"`, treat `onChange`
   as draft-only and commit on blur — do not fire a server write that reloads and re-sorts
   the list while the calendar is still open.
4. **Same for other multi-step editors** (decimal fields, composite values): draft locally,
   commit when the user is done (see Metric tracking value/date cells).

| Action while editing a sorted column | Good                                    | Bad                                   |
| ------------------------------------ | --------------------------------------- | ------------------------------------- |
| Open date picker / change month      | Calendar navigates; no write; row stays | Picker closes, value saves, row jumps |
| Key into a value cell                | Local draft only                        | Every keystroke re-sorts              |
| Blur / Enter after a real change     | Commit, then re-sort when focus leaves  | Already sorted three steps ago        |

This is the same principle as the drawer: **do not hide or rearrange the user's map while
they are working on a piece of it.**

### Avoid modals for routine editing

Modals hide context, increase cognitive load, and feel interruptive. Reserve them for:

- **Destructive confirmations** — "Delete this project and everything under it?"
- **Critical blocking actions** where the user _must_ decide before continuing
- **Fast capture** — a transient, keyboard-invoked surface that owns no record

Never use a modal for a standard create/edit flow.

#### The capture exception

Quick capture (`QuickCaptureDialog`) is a modal on what looks like a create flow, and is
still right. The discriminator is **whether context preservation is wanted**:

|                      | Standard create/edit | Fast capture            |
| -------------------- | -------------------- | ----------------------- |
| Purpose              | Full record editing  | Get it out of your head |
| Context preservation | High                 | **Low, intentionally**  |
| Bound to a record    | Yes                  | No — nothing exists yet |
| Bulk / freeform text | No                   | Yes                     |
| Pattern              | Drawer               | Modal                   |

The rule protects your view of the outline while you work _on_ something in it. During
capture the outline is irrelevant by definition — the thought arrived from somewhere else,
and the faster the app gets out of the way the better it has done its job. A drawer would
also be slower to open, slower to dismiss, and would imply a record relationship that does
not exist.

**This does not license** a modal for anything with an id: editing a node, a note, or an
appointment stays in a drawer. If you would return to it and edit it again, it is not
capture. Keep a capture surface extremely lean, so it reads as a tool rather than a form.

**This is the main place we depart from Achieve Planner.** Achieve opens a modal for
everything, and routinely opens modals on top of modals. That is the part of its design
worth leaving behind — the workflow it encodes is excellent; the containers it uses are not.

`ConfirmDialog` in `src/components/detail/` serves the first two cases — the outline's delete
flow and the drawer's unsaved-changes prompt; use it rather than `window.confirm`. Every
centered dialog, including those, is built on `ModalShell`. See `modal-pattern.md`.

The stacked-modal rule bites hardest in the repeating lists inside a detail form — Achieve
opens a second modal to edit an Objective or a Risk. We expand the row in place instead
(`ItemList`).

### Tabs organise sections within a form

Tabs are the **correct** pattern for grouping sections of a complex record form, and this
app uses them exactly as Achieve does — a Project or Result Area opens with its fields
grouped across several tabs.

The original version of this standard argued against tabs. That argument was aimed at using
tabs to represent **individual data items** — one tab per record — which was a quirk of that
app's earlier design and is not something we do. It was never an argument against tabs as a
way to organise sections of a single form.

The distinction that matters:

| Tabs for…                     | Verdict                             |
| ----------------------------- | ----------------------------------- |
| Sections of one record's form | **Correct.** Use them.              |
| One tab per data item         | Wrong. That's what the grid is for. |

## Editing Triggers

Prefer explicit, discoverable actions over hidden gestures, and standardise whichever
trigger is chosen across every view — users should never have to relearn how to open a
record.

The bindings, which every view must match:

| Gesture                  | Opens                                          |
| ------------------------ | ---------------------------------------------- |
| `Enter`, or double-click | The full record, in a drawer — as Achieve does |
| `F2`                     | Inline name editing, the Windows convention    |

Both also appear as toolbar buttons, and the selected row carries a small open-record
affordance — a gesture nobody can see is not a discoverable action.

Below `md`, **single tap** opens the record and **long press** opens the row menu. Double-click
and right-click do not exist on touch, so these are translations of the same bindings rather
than a second set to learn. `F2` has no compact equivalent — inline rename happens in the
sheet. See `responsive.md`.

### Icon-only controls need a tooltip

A control whose visible content is only a glyph (`‹ ›`, `×`, a chevron, a colour swatch, a
toolbar icon) must have a `title`. The glyph is not a label. `aria-label` is not a
substitute — it is not visible on hover, and this app is used with a mouse.

```tsx
<button type="button" title="Previous month" aria-label="Previous month">
  ‹
</button>
```

- `ToolbarIconButton` already requires `title` in its signature. Same rule for pagers, pane
  toggles, close buttons, colour swatches, expand/collapse chevrons, and any other icon-only
  control.
- When the control is disabled, `title` says **why** (`navigation.md`).
- A button that already shows words does not need a tooltip repeating them.

## Forms & Validation

### Minimise required fields

Only hard-require what is genuinely essential. Ask: "can the system function without this
right now?" If yes, make it optional. In this app almost nothing is truly required — a node
needs a type and a place in the tree; even the name can be filled in later.

### Allow partial saves

Let users save incomplete records. Forcing completeness produces junk data, lost work, and
abandonment — people frequently know a task exists before they know how long it will take.

### Use drawers for complex forms

For forms with many fields, conditional sections, or dropdowns needing room to expand, use
the drawer. Never cram them into grid cells.

### Save stays open; leave is separate

A drawer is a workspace, not a one-shot dialog. For structured record forms (node detail,
appointments) without autosave, commit and leave are independent. Use the shared
`DrawerFooter` — never invent a different button set:

```
[ Cancel ]                          [ Save ]   [ Save & Close ]
```

- **Save** (outlined) commits and **stays open**, with "Saved" / "Unsaved changes" feedback
  (⌘/Ctrl+S).
- **Save & Close** (solid primary, rightmost) commits then leaves (⌘/Ctrl+Enter); failed
  saves stay open.
- **Cancel** (ghost, left) / header × / Escape leave the drawer; if dirty, confirm discard.

Do not make a single Save that always closes — that forces reopen thrashing across tabs.
Do not ship only stay-open Save either: finishing an edit then becomes Save + Cancel every
time. Document-like surfaces (notes, session log) **autosave** instead; short nested
sub-editors may treat Save as done (Cancel + Save only). Details live in
`drawer-pattern.md`.

### Inline validation

- Validate **on blur**, not while typing.
- Error messages must be **specific and actionable** — "Effort must look like 2 h, 45 min,
  or 3:45 h", not "Invalid input".
- Clear the error state as soon as the user corrects it.
- Keep **Save** available unless a submit is in progress; show blocking errors on the save
  attempt rather than disabling the button.
- Unparseable input in a grid cell **reverts to the stored value and flags the cell** rather
  than saving something wrong or silently clearing it.
  Validation here is light by design (see partial saves); it is still not a reason to close
  on Save — stay open so a rare failure can be fixed in place.

## Decision Guide

| Question                                                                         | If yes →                                    | If no →                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Is the field already a grid column?                                              | Edit inline                                 | Drawer                                           |
| Is the value a rollup of descendants?                                            | Read-only                                   | Editable                                         |
| Are there more than 3–4 fields to edit at once?                                  | Drawer (not modal, not inline)              | Inline is fine                                   |
| Does the form have distinct groups of fields?                                    | Tabs within the drawer                      | A single scrolling pane                          |
| Is this destructive or irreversible?                                             | Confirmation dialog                         | Just do it, with clear feedback                  |
| Does it edit a record that already exists?                                       | Drawer, never a modal                       | A modal may be right — see the capture exception |
| Does the user need the outline visible while editing?                            | Drawer                                      | Drawer is still fine                             |
| Is this long-form writing with little to validate?                               | Autosave drawer                             | Explicit Save / Save & Close footer              |
| Is this a short nested "return a value" editor?                                  | Save may close (exception)                  | Save stays open; Save & Close finishes           |
| Is the viewport below `md`?                                                      | List + full-screen sheet                    | Grid + right drawer                              |
| Is the action only reachable by hover / right-click / double-click / a shortcut? | It is broken on touch — add a tappable path | Ship it                                          |
| Does editing this cell change the active sort key?                               | Draft locally; freeze order until blur      | Never live re-sort under the cursor              |
| Is this a multi-step control (date picker, decimal, composite)?                  | Commit on blur / Enter / Accept             | Do not write on intermediate steps               |
