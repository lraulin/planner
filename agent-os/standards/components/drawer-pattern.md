# Form Drawer Pattern

> For why we use drawers instead of modals, see `ux-principles.md`.

Editing a full record uses a **right-sliding drawer**, never a modal and never full-page
navigation. The outline stays visible behind it.

Adapted from the `wrcs/reactwrcs` standard of the same name. That version is written for MUI
and AG Grid (`<Drawer anchor="right">`, `ModalProps`, `sx`, `refreshData`); none of that
applies here. This project is Tailwind, React Server Components, and server actions — so the
**rules** carry over and the code does not.

## Structure

A drawer is a client component holding its own form state, rendered from the page shell:

```tsx
<Drawer open={open} onClose={requestClose} labelledBy="node-form-title">
  {open && node && <NodeForm node={node} onClose={requestClose} />}
</Drawer>
```

## Rules

- **Guard the content**, not the container: `{open && node && ...}`. Never render a form
  before the record it edits is available.
- **Do not unmount the form on close** if the user might reopen it mid-edit. Where state
  must survive, lift it; where it must not, key the form on the node id so switching records
  resets it.
- **Width**: full-width on small screens, capped around `720px` on desktop
  (`w-full sm:w-[90%] md:max-w-[45rem]`).
- **Position below the app chrome** — the tab strip stays visible and clickable.
- **Escape closes**, a backdrop click closes, and focus is trapped inside while open. Return
  focus to the row that opened it. If the form is dirty, both paths go through the same
  unsaved-changes prompt as the Close button — never bypass it.
- **Respect `prefers-reduced-motion`** — the slide transition is already disabled globally
  in `globals.css`, so don't reintroduce it inline.

## Open/close flow

1. **Edit** — set the selected node and open, together.
2. **Create** — clear the selected node and open, together.
3. **Close** — reset open, selected node, and dirty state in one action. Leaving any of the
   three behind is the source of most drawer bugs.

## Unsaved changes

If the form is dirty, closing prompts for confirmation. This is a destructive-confirmation
case under `ux-principles.md`, so a dialog is appropriate here.

## Saving — two models, pick by content

### Explicit Save stays open (default for structured records)

Node detail forms, appointments, and any multi-field record with a draft use **Save that
does not close**. Close is a separate action.

Why: a drawer is a workspace, not a one-shot dialog. People edit across tabs, checkpoint
mid-way, then keep going. Tying commit to leave forces either reopen thrashing or living
under a permanent "Unsaved changes" banner.

```tsx
const result = await saveNodeAction(values);
if (!result.ok) {
  setError(result.error); // check the error first
  return; // and stay open so the user can fix it
}
setDirty(false);
setJustSaved(true); // footer shows "Saved"; clear when the next edit dirties the form
// do NOT close — the user closes when they are done
// revalidatePath already refreshed the grid behind the drawer
```

Rules for this model:

- **Save** persists, clears dirty, shows brief **Saved** feedback, **stays open** (primary).
- **Save & close** persists then leaves — sugar for the done path, not a substitute for
  stay-open Save. Bind ⌘/Ctrl+Enter to it. Failed writes still stay open with the error.
- **Close** / Escape / backdrop leave the surface. If dirty, prompt to discard.
- Never close a drawer over a failed save — the user's input disappears with it.
- On **create**, promote the draft to the new id in local state so the next Save is an
  update, then stay open. `onSaved` (if the parent needs one) means **refresh background
  data**, not **close the drawer**.

Footer status (mutually exclusive, right-aligned):

| State                         | Label             |
| ----------------------------- | ----------------- |
| Dirty                         | Unsaved changes   |
| Clean after a successful Save | Saved             |
| Saving in flight              | (button: Saving…) |

### Autosave (document-like surfaces)

Use when there is nothing meaningful to validate on commit and sessions are long writing
rather than form fill:

- Notes drawer
- Fitness session log
- Daily notes pane

There is no Save button and no discard prompt. Debounced writes + a status line
("Saves as you type" / "Saved · 2s ago" / Retry on failure). A failed autosave keeps the
text on screen and the drawer open.

Do **not** add a Save button to an autosave drawer for consistency with node forms —
match the task, not the chrome.

### Short sub-editors (exception)

A nested, single-purpose editor whose only next step is "return the result and leave"
(e.g. create/edit exercise from the session log) may treat **Save as done** and close on
success. That is a return value hand-off, not a multi-tab record workspace. Prefer this
only when staying open would strand the user with nothing useful to do next.

## Server actions

Drawer forms submit through **server actions**, following the pattern already established in
`src/app/outline/actions.ts`: the action returns `{ ok: false, error }` rather than throwing,
so a rejected save renders inline instead of crashing the view.

`revalidatePath` in the action refreshes the outline, so there is no separate refresh call
to make from the form for grid data. Parents that hold client-side schedule state still
need an `onSaved` refresh callback — that callback must **not** close the drawer.

## Tabs inside the drawer

Group a record's fields into tabs when there are enough to warrant it, as Achieve does. On
save, run full validation across **every** tab and switch to the first tab containing an
error — never leave a user staring at a valid-looking tab wondering why save did nothing.
