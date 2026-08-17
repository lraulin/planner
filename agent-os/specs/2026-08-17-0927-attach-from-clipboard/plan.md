# Add attachment from clipboard

**Status: frozen / complete** (2026-08-17)  
Spec folder: `agent-os/specs/2026-08-17-0927-attach-from-clipboard/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-08-0932-task-name-url-links/` — same URL extract, title fetch, and “links only” attachment model
- **Extends:** `agent-os/specs/2026-08-06-1010-command-surface/` and `agent-os/specs/2026-08-13-1050-menu-completeness/` — one registered command on every surface; a command without a menu is not shipped
- **Extends:** `agent-os/specs/2026-08-06-1506-right-click-completion/` — right-click is the row-scoped path; unavailable is disabled with a reason
- **Extends:** `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` — attachment rows stay title + URL on `node_items`; no blob store

## Context

Adding a link to a project or task today means: open the drawer → Attachments → new row → paste the URL. That is too many steps when the URL is already on the clipboard.

This is a capture-quality improvement on the Phase 2 attachments MVP (links only). It does not change the roadmap stage (no Drive picker, no S3).

**Achieve divergence (intentional):** Achieve only added attachments from the Project/Task form (browse / launch). There was no outline command. We are adding one because the web app’s attachments are share links, and the common habit is “copy link, attach to this row.”

## Decisions

- Clipboard content is **text URLs only** (`extractHttpUrls`: `http(s)://`, `www.`, whole-clipboard bare host). Images, files, and `file://` stay out.
- After success, **stay on the grid**. Silent, like Copy as text.
- One registered command: **Item ▸ Add attachment from clipboard**, also on the row menu, Commands panel, `⌘K`, and phone `⋯`. No toolbar icon. No dedicated chord.
- **Projects and tasks only** — the types that already have an Attachments tab. Other kinds: visible, disabled, “Attachments live on projects and tasks.”
- Every node command deck (Outline, Projects, Tasks, Goals, Result Areas, Chooser). Notes, Day, Schedule, Wishes: not offered.
- **Single row** — the right-clicked / selected one. Same as Open / Rename.
- Skip a URL already attached to that node (normalized). If every URL is already there, succeed silently.
- Title autofill from the page when the name is blank. Fetch failures still save the URL.
- The browser will not let us read the clipboard until the click. The command is **enabled whenever the row can take an attachment**. Empty / non-URL / permission-denied is a **one-button notice**.
- `attachUrlsToNode(userId, nodeId, text)` refuses anything that is not a project or task, and is scoped by `userId`.

## Acceptance criteria

- [x] Right-click a task or project → **Add attachment from clipboard** creates an attachment from the clipboard URL and leaves the drawer closed
- [x] Item menu, Commands panel, `⌘K`, and phone `⋯` offer the same command with the same label
- [x] Title autofills from the page when fetch succeeds; URL is still saved when it does not
- [x] Several distinct URLs in one clipboard clip each become an attachment; already-attached URLs are not duplicated
- [x] On a goal / result area / no selection the command is visible and disabled, with the specific reason
- [x] Clipboard empty, non-URL, or unreadable → one-button notice; nothing is written
- [x] A second user cannot attach to the first user’s node
- [x] Outline, Projects, Tasks, and Chooser (task rows) all work

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                       | Why                                                                                                                |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Split `extractHttpUrls` into its own module (no `db` import) | Importing the refusal helper from `attachUrls.ts` pulled Postgres into the client bundle and 500'd every Plan page |

## Task 1: Save Spec Documentation

Create this folder. **Status: active.**

## Task 2: `attachUrlsToNode` in `src/lib/url/`

New module. Reuse extract / normalize / title fetch. Refuse missing or non-project/task. Dedup. Fetch titles outside a write transaction.

## Task 3: Thin server action

`attachUrlsToNodeAction(nodeId, text)` in `detail-actions.ts`. Server extracts; client may pre-check.

## Task 4: Register the command and wire the hosts

`record.attach-from-clipboard` on the Item menu and row menu. `useNodeCommandDeck` + `OutlineGrid`. One-button notice for clipboard failures.

## Task 5: Verify, freeze spec, update roadmap

Verified in the browser on Outline (right-click attach + notice) and Goals (disabled with reason). Commands panel on Tasks lists the same verb. Integration tests cover title autofill, multi-URL, dedup, and cross-user. Roadmap attachments line stays “links only.”

## Follow-ups (new work — not amendments to this frozen spec)

- Attachments tab on Goals, if those rows should host links too
- A dedicated chord, if daily use shows the menu/palette path is too slow
- Drive / Dropbox pickers (already on the roadmap)

> While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
