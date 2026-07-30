# Modal Pattern

> For _when_ a modal is allowed at all, see `ux-principles.md`. Three cases only.

Every centered dialog is built on **`ModalShell`** (`src/components/detail/ModalShell.tsx`).
Never hand-roll the backdrop — four dialogs each carried their own copy before it was
extracted, and they had already drifted apart on backdrop opacity.

```tsx
const titleId = useId();

<ModalShell open={open} onClose={close} labelledBy={titleId} width="max-w-lg">
  <div className="p-5">
    <h2 id={titleId}>Show Fields</h2>…
  </div>
</ModalShell>;
```

`ModalShell` supplies the backdrop and click-away, focus-in / Tab-trap / focus-restore
(`useModalFocus`), the Escape handler, and the `role` wiring. It renders nothing when `open`
is false. **Padding is yours** — the shell sets no padding so a dialog can have a flush
header or footer.

Focus handling stays for keyboard reasons, not accessibility ones: it is why Escape returns
you to the row you opened the dialog from, and why Tab does not wander into the grid behind
it.

## Rules

- **The `role` is functional, not decoration.** `"alertdialog"` for a destructive
  confirmation, `"dialog"` for everything else — and `isModalOpen()` finds a dialog by
  exactly these, so dropping the role breaks the capture shortcut's guard (below).
- **`labelledBy` points at the dialog's own heading.** A `useId` and an `id` on the `<h2>`;
  it keeps every dialog's API uniform for no real cost.
- **Escape is handled in the capture phase.** A grid's own keydown listener would otherwise
  see it first and cancel an inline edit _behind_ the dialog.
- **A visible button always accompanies a keyboard shortcut.** Touch has no Enter key, and
  a gesture nobody can see is not a discoverable action.

## Unmount a dialog that holds a draft

**Closing discards. Unmount the dialog rather than hiding it**, so the next open starts
clean:

```tsx
{
  open && <QuickCaptureDialog onClose={close} />;
} // not: <Dialog open={open} …>
```

Both draft-holding dialogs do this — `NoteFilterDialog` via an outer wrapper that returns
`null`, `QuickCaptureDialog` via the parent. It is what makes Cancel mean cancel, and it
avoids the bug it replaces: reseeding state from props inside an effect.

Passing `open` down and letting `ModalShell` unrender is right only for a dialog with no
draft of its own, like `ConfirmDialog`.

## Closing is the success signal

A failed submit **keeps the dialog open** and renders the error inline; a successful one
closes it. So the dialog disappearing is what tells the user it worked — the same rule
`drawer-pattern.md` states as "never close a drawer over a failed save".

Do not add a toast on top of that. There are none in the app, and a feedback convention
should be chosen for the whole app rather than introduced by whichever feature happened to
want one first.

## Modals are invisible to their own guard unless they use the shell

The app-wide capture shortcut suppresses itself with `isModalOpen()`
(`src/lib/keyboard.ts`), which queries `[role="dialog"], [role="alertdialog"]`. A dialog
built outside `ModalShell`, or missing its `role`, will not be seen — and `c` will open
quick capture on top of it.

## Deliberately not provided

No stacking, no scroll lock, no portal. Nothing here needs them, and `ux-principles.md`
names stacked modals as the specific Achieve behaviour worth leaving behind. If you find
yourself wanting a second modal over the first, the second one is probably a drawer.
