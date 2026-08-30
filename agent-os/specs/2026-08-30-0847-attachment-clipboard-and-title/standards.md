# Standards for Attachment clipboard button, title autofill, and fetch-name

Applied as of standards commit `6192620bace854340d475553c5bb212b74e0cde4`.

**References, not copies** — see `AGENTS.md`. Recover the exact text that applied with
`git show 6192620bace854340d475553c5bb212b74e0cde4:agent-os/standards/<path>`.

## Applicable standards

- `agent-os/standards/components/drawer-pattern.md` — attachment rows write through; the clipboard button and fetch-name must not require Save; the drawer stays open.
- `agent-os/standards/components/ux-principles.md` — immediate feedback on clipboard/fetch failure (the list error line, not a toast); the new control is labelled text, not an icon-only glyph.
- `agent-os/standards/components/navigation.md` — a command without a menu is not shipped; `record.attach-from-clipboard` already has a menu. The Attachments-tab button is a form control for that verb, not a second command.
- `agent-os/standards/development/clean-code.md` — one attach implementation (`attachUrlsToNode`); force title fetch extends the existing autofill helper rather than a second fetch; thin `detail-actions.ts`; logic in `src/lib`.
- `agent-os/standards/development/testing.md` — pure tests beside `pageTitle` / clipboard refusal; integration tests for force-overwrite and cross-user; no React component tests.
- `agent-os/standards/development/security.md` — every mutation takes `userId` and proves ownership; missing and other-user rows are the same error.
- `agent-os/standards/development/commits.md` — imperative subject naming the effect, body records the autofill root cause.

## Not applicable

- `agent-os/standards/components/data-grid.md` — this is the drawer ItemList, not DataGrid.
- `agent-os/standards/components/modal-pattern.md` — drawer clipboard errors stay on the list; the grid command’s NoticeDialog is unchanged.
- `agent-os/standards/database/migrations.md` — no schema change.

## Deviations

None.
