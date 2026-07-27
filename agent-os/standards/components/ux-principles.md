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
- **Keyboard first** — this app replaces a keyboard-driven Windows tool. Anything reachable
  by mouse should be reachable by key, and the primary workflows should be faster by
  keyboard than by mouse.
- **Accessibility is not optional** — ARIA, keyboard navigation, focus management, contrast.
- **Performance is UX** — slow expand/collapse or heavy re-renders destroy usability in a
  dense grid.
- **Forgiveness & safety** — let users recover easily; never force inaccurate data entry.

## Layout & Navigation

### Grid + drawer is the default

The **outline grid + right-sliding drawer** is the standard pattern for list + form work
(see `drawer-pattern.md`):

- **Grid** for scanning, filtering, reordering, and fast inline edits
- **Drawer** for the full record — the grid stays visible, preserving context

### Inline editing for grid-visible fields

Fields that appear as grid columns — name, priority, effort, deadline, state, focus — are
edited **in place**. Opening a drawer to change a priority would be absurd. The drawer is
for the fields that don't fit on a row.

Where a value is a rollup of its descendants (a parent's effort), the cell is **read-only**.
Never offer an editor whose result would be invisible behind a computed value.

### Avoid modals for routine editing

Modals hide context, increase cognitive load, and feel interruptive. Reserve them for:

- **Destructive confirmations** — "Delete this project and everything under it?"
- **Critical blocking actions** where the user _must_ decide before continuing

Never use a modal for a standard create/edit flow.

**This is the main place we depart from Achieve Planner.** Achieve opens a modal for
everything, and routinely opens modals on top of modals. That is the part of its design
worth leaving behind — the workflow it encodes is excellent; the containers it uses are not.

> **Known deviation:** the outline's delete flow currently uses `window.confirm`. That is
> the right _category_ of interaction under this standard, but it should become a proper
> dialog when the drawer work lands.

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

Inline name editing is triggered by `Enter` on the selected row or double-click. Opening the
full record should have a single, consistent trigger everywhere it exists.

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

### Inline validation

- Validate **on blur**, not while typing.
- Error messages must be **specific and actionable** — "Effort must look like 2 h, 45 min,
  or 3:45 h", not "Invalid input".
- Clear the error state as soon as the user corrects it.
- Keep **Save** available unless a submit is in progress; show blocking errors on the save
  attempt rather than disabling the button.
- Unparseable input in a grid cell **reverts to the stored value and flags the cell** rather
  than saving something wrong or silently clearing it.

## Decision Guide

| Question                                              | If yes →                       | If no →                         |
| ----------------------------------------------------- | ------------------------------ | ------------------------------- |
| Is the field already a grid column?                   | Edit inline                    | Drawer                          |
| Is the value a rollup of descendants?                 | Read-only                      | Editable                        |
| Are there more than 3–4 fields to edit at once?       | Drawer (not modal, not inline) | Inline is fine                  |
| Does the form have distinct groups of fields?         | Tabs within the drawer         | A single scrolling pane         |
| Is this destructive or irreversible?                  | Confirmation dialog            | Just do it, with clear feedback |
| Does the user need the outline visible while editing? | Drawer                         | Drawer is still fine            |
