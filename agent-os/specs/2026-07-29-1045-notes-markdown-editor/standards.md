# Standards applied — Notes tab with a markdown editor

Following the recent convention (see the weekly-planning-wizard spec): the points that
actually bind this work and why, not a copy of the standards files. Read the originals in
`agent-os/standards/` for the full text.

## `components/ux-principles.md`

- **Grid + drawer is the default, and Notes does not get an exception.** A note's body is
  the record rather than a field of it, which is the strongest case in the app for a
  permanent editing pane — but autosave plus a snippet column close the gap. See `shape.md`.
- **Inline editing for grid-visible fields.** Flag, Title, Subject, Date, and Contexts are
  columns, so they are edited in the row. Opening a drawer to set a flag would be absurd.
- **No modal for routine editing.** Achieve opens Note Information as a modal; we use the
  drawer. The Note Item Filter stays a dialog — it is a blocking decision the user is
  explicitly asking for, not an edit.
- **`Enter` / double-click opens the record; `F2` renames inline.** Identical to every
  other tab; a user must never relearn how to open a record.
- **Keyboard first.** Achieve's own hint bar defines the bindings to match: `Insert` adds a
  sibling, `Ctrl+Insert` adds a child, `Esc` cancels. Plus `Tab` / `Shift+Tab` to
  indent/outdent and `Delete` behind a `ConfirmDialog`.
- **Error prevention over recovery.** Deleting a note takes its whole subtree, so it
  confirms first via `ConfirmDialog`, never `window.confirm`.
- **Never advertise a capability you cannot deliver.** The stated reason `useGridTab.ts`
  leaves collapse off the list tabs, and the reason node `notes` fields are not merged into
  this grid as pseudo-rows.
- **Allow partial saves / minimise required fields.** A note with only a body and no title
  is valid and normal.

## `components/drawer-pattern.md`

- **Guard the content, not the container**, and **key the form on the record id** so
  switching notes resets the draft rather than carrying it across.
- **Width capped around 720px.** Good for prose, too narrow for side-by-side source and
  preview — hence an Edit/Preview toggle rather than a split.
- **Escape closes, backdrop closes, focus is trapped, focus returns to the row.** Inherited
  free from the shared `Drawer`.
- **Server actions return `{ ok: false, error }` rather than throwing**, so a failed save
  renders inline instead of crashing the view.

**Documented departure — autosave.** The standard's flow is draft → Save → close, with a
dirty-close confirmation. The note body instead saves on a ~800 ms debounce, flushes on
close and unmount, and shows a status line instead of a Save button; there is no
unsaved-changes dialog. Justified because a note has nothing to validate — no cross-field
constraints and no content a server can reject — so the prompt would only ever be friction.
The order-of-operations rule still holds: **a failed save keeps the text and the drawer
open**, never closes over lost input.

Everything else in the app keeps the standard flow, including the node detail forms that
Task 9 adds markdown to — which is exactly why `MarkdownEditor` owns no persistence.

## `development/testing.md`

- **Pure logic lives in `src/lib/notes/**` with adjacent `*.test.ts`.** That is `snippet`,
  `slice`, `filter`, and `editing` — snippet extraction and cursor arithmetic are precisely
  the places a wrong answer looks plausible.
- **`mutations.integration.test.ts` against real Postgres**, and it is not done until a
  second user has tried to read, update, and delete the first user's note and failed at
  every step.
- **No React component tests.** No setup exists and the bug class is already covered by the
  type-aware ESLint rules. Anything in the components with real logic gets extracted to
  `src/lib/notes/` instead — which is why the textarea helpers are pure
  `(text, selection) → { text, selection }` functions rather than event handlers.
- **A test earns its place if it would fail on a plausible mistake.** Concretely here: a
  snippet that starts with a fenced code block, sort applying within siblings versus across
  all rows, Match All versus Match Any, and Enter on an empty list item clearing the marker
  rather than adding another.
- **`npm run test:unit` passing does not mean the database tests ran.** Check for the skip
  warning after touching `mutations.ts` or `queries.ts`.
