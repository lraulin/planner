# Add attachment from clipboard — Shaping Notes

**Status: frozen / complete** (2026-08-17)

## Scope

A registered command that reads the system clipboard for web URLs and appends them as
attachment rows on the selected project or task — reachable from right-click, the Item
menu, the Commands panel, `⌘K`, and phone `⋯`.

### Out of scope

- Screenshots / image clipboard / first-party file hosting
- Attachments tab on Goals
- Notes attachments
- Drive / Dropbox pickers
- A dedicated keyboard shortcut
- Opening the drawer after attach
- Attaching raw non-URL text as a nameless row

## Decisions

- Links only, using the existing extract + title-autofill path
- Stay on the grid after success (the point is to skip the drawer)
- Projects and tasks only, because that is where the Attachments tab already exists
- Command present everywhere the node deck is; disabled with a reason on other kinds
- Cannot pre-inspect the clipboard, so enablement is about the row, not the clip
- One-button notice on clipboard failure; no toast stack
- Deliberate Achieve divergence: AP only attached from the form
- URL extract lives in `extractHttpUrls.ts` (no `db`) so the client refusal check cannot pull Postgres into the browser bundle

## Context

- **Visuals:** None
- **References:** `taskNameLinks.ts`, `pageTitle.ts`, `commandDeck.ts`, `useNodeCommandDeck.tsx`, detail-forms attachments
- **Product alignment:** Capture-quality improvement on the Phase 2 attachments MVP (links only). No roadmap phase change.

## Standards Applied

- **components/navigation** — menu is the catalog; row menu is the row-scoped subset; unavailable is disabled with a reason
- **components/ux-principles** — keyboard path via menu / palette; immediate feedback on failure; no new toast
- **components/modal-pattern** — one-button notice on ModalShell
- **development/clean-code** — logic in `src/lib/url/`, thin action, one attach implementation
- **development/testing** — pure + integration with cross-user; no component tests
- **development/security** — every write scoped by `userId`
