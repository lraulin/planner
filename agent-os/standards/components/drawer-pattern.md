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
<Drawer open={open} onClose={close} labelledBy="node-form-title">
  {open && node && <NodeForm node={node} onSaved={close} />}
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
  focus to the row that opened it.
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

## Saving

Drawer forms submit through **server actions**, following the pattern already established in
`src/app/outline/actions.ts`: the action returns `{ ok: false, error }` rather than throwing,
so a rejected save renders inline instead of crashing the view.

```tsx
const result = await saveNodeAction(values);
if (!result.ok) {
  setError(result.error); // check the error first
  return; // and stay open so the user can fix it
}
close(); // revalidatePath already refreshed the outline
```

Order matters: check the error, then close. Never close a drawer over a failed save — the
user's input disappears with it.

`revalidatePath` in the action refreshes the outline, so there is no separate refresh call
to make.

## Tabs inside the drawer

Group a record's fields into tabs when there are enough to warrant it, as Achieve does. On
save, run full validation across **every** tab and switch to the first tab containing an
error — never leave a user staring at a valid-looking tab wondering why save did nothing.
