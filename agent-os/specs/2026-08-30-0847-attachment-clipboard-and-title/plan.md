# Attachment clipboard button, title autofill, and fetch-name

**Status: active**  
Spec folder: `agent-os/specs/2026-08-30-0847-attachment-clipboard-and-title/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-17-0927-attach-from-clipboard/` — same `attachUrlsToNode` / `extractHttpUrls` / title fetch; this puts that verb on the Attachments tab the earlier spec skipped so it could stay on the grid
- **Extends:** `agent-os/specs/2026-08-08-0932-task-name-url-links/` — same `fetchPageTitle` / `shouldAutofillAttachmentTitle` path used when a URL is pasted into an attachment URL field
- **Extends:** `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` — attachment rows stay title + URL on `node_items`; no blob store
- **Does not supersede** the outline command, its “no toolbar icon”, or “stay on the grid after success”

## Context

The Attachments tab still requires **Add attachment → expand → paste into URL → blur**, which is the path `2026-08-17-0927` called out as too many steps. The outline already has **Item ▸ Add attachment from clipboard**. The form does not.

Pasting a URL into the URL field is supposed to fill a blank Name from the page title (`autofillAttachmentTitleFromUrl` in `updateNodeItemAction`). That fill is failing silently in daily use. Fetch failures currently return `null` and leave the name blank with no error.

Phase 2 attachments MVP (links only). Capture-quality on the form, same as the 2026-08-17 outline command. No Drive picker, no S3.

## Decisions

- **One spec, three outcomes:** clipboard button on the Attachments list; fix title autofill on URL paste; per-row **Fetch name from page** that overwrites Name.
- **Links only.** Reuse `attachUrlsToNode` / `extractHttpUrls`. Images, files, `file://`, Drive pickers stay out (roadmap MVP).
- **Clipboard button** sits next to Add attachment on `ItemList` when `kind === "attachment"` only. Label **From clipboard**; `title` tooltip is the existing command label (`Add attachment from clipboard`). Not a new registered command — `record.attach-from-clipboard` already exists on Item / row menu / `⌘K`.
- Clipboard read happens on click (browser will not hand over text earlier). Empty / non-URL / permission-denied uses **ItemList’s existing error line** (same place as CSV Import), not a second NoticeDialog. The grid command keeps its notice.
- Success: `attachUrlsToNodeAction` then `refreshItems`. Drawer stays open. Status line e.g. `Added 2 attachments.` Already-attached URLs stay skipped (existing dedup). Zero created because they were all dupes: `Already attached.` not an error.
- **Title autofill on URL paste must actually run.** Implement finds the cause; likely candidates: DraftTextField only commits URL on blur (paste without leaving the field never writes), and `fetchPageTitle` failing silently (bot UA / timeout / non-HTML). Do not “fix” it by only adding retry.
- **Fetch name from page** on the expanded attachment editor, next to Name. Enabled when the URL is a web URL. Always re-fetches and **overwrites** Name. Fetch failure keeps the current name and shows the list error (`Could not read the page title.`). Blank URL: control disabled with that reason.
- Force-overwrite is a `force` path on the existing autofill helper (or a sibling in `src/lib/detail` / `src/lib/url`) — not a second fetch implementation. `shouldAutofillAttachmentTitle` stays the blank-name guard for the automatic path.
- List rows still write through (`drawer-pattern`). No Save required.

### Out of scope

- Screenshots / image clipboard / first-party file hosting
- Attachments on Goals / Notes
- Drive / Dropbox pickers
- A new command or dedicated chord
- Changing the outline clipboard command’s NoticeDialog

## Acceptance criteria

- [ ] Attachments tab **From clipboard** with a link on the clipboard creates the row(s) without Add attachment first; title autofills when fetch succeeds
- [ ] Several distinct URLs in one clip each become a row; already-attached URLs are not duplicated
- [ ] Clipboard empty, non-URL, or unreadable → error on the list; nothing written
- [ ] Button is absent on other ItemList kinds (Objectives, Risks, …)
- [ ] Pasting a URL into an attachment URL field fills a blank Name from the page when fetch succeeds, without a second trip to rename
- [ ] Fetch failure on automatic fill still saves the URL; Name stays blank; the failure is visible (not silent)
- [ ] **Fetch name from page** overwrites Name with the current page title; on failure keeps the current name and shows the error
- [ ] A second user cannot attach to, or refetch a title on, the first user’s row
- [ ] Outline **Item ▸ Add attachment from clipboard** still works as today

## Changes from original plan

Material refinements during implementation (requirements, design, or scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create this folder with plan, shape, standards, and references. **Status: active.** Pin standards commit `6192620bace854340d475553c5bb212b74e0cde4`.

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Task 2: Force title fetch in lib, then the editor control

- Extend the autofill helper with a force/overwrite path that still no-ops on missing/other-user/non-attachment/non-web-URL, but **does** replace a non-empty title.
- Return the title or a distinct failure so the action can tell the UI.
- Thin action next to `updateNodeItemAction`.
- ItemEditor (attachment only): **Fetch name from page** next to Name. Cross-user integration test; unit test that force overwrites and the automatic path still refuses a set name.

## Task 3: Make URL-paste autofill work, and stop swallowing fetch failure

Trace the Add → paste URL path end to end (DraftTextField commit, `updateNodeItemAction`, `autofillAttachmentTitleFromUrl`, `refreshItems`). Fix the actual cause. If paste never commits until blur, commit a URL-shaped paste (and unmount) so leaving the field is not required. If fetch returns null, surface it on the list instead of looking like a no-op. Automatic fill still must not overwrite a name the user typed (`shouldAutofillAttachmentTitle`).

## Task 4: From clipboard on the Attachments list

Optional `onAttachFromClipboard` on `ItemList`, wired only from the attachment `list()` in `NodeDetailDrawerBody`. Read clipboard → `clipboardAttachRefusal` → `attachUrlsToNodeAction` → `refreshItems`. Reuse `useAttachFromClipboard` only if it can report into the list error/status line without a second dialog; otherwise a small parent callback is fine — do not copy `attachUrlsToNode`.

## Task 5: Verify, freeze spec, update roadmap

Browser: Outline drawer Attachments — From clipboard (one URL, several, duplicate, empty clip); paste into URL fills Name; Fetch name from page overwrites; fetch failure keeps name and shows error; Objectives/Risks have no clipboard button. Grid Item ▸ Add attachment from clipboard still works. lint, typecheck, unit; integration against Postgres (cross-user). Freeze. Roadmap attachments line stays “links only”; no phase change.
