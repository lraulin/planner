# Attachment clipboard button, title autofill, and fetch-name

**Status: frozen / complete** (2026-08-30)  
Spec folder: `agent-os/specs/2026-08-30-0847-attachment-clipboard-and-title/`

This document is the durable record of **what was built and why**. Further change opens a
new delta-spec rather than editing this folder.

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

- [x] Attachments tab **From clipboard** with a link on the clipboard creates the row(s) without Add attachment first; title autofills when fetch succeeds
- [x] Several distinct URLs in one clip each become a row; already-attached URLs are not duplicated
- [x] Clipboard empty, non-URL, or unreadable → error on the list; nothing written
- [x] Button is absent on other ItemList kinds (Objectives, Risks, …)
- [x] Pasting a URL into an attachment URL field fills a blank Name from the page when fetch succeeds, without a second trip to rename
- [x] Fetch failure on automatic fill still saves the URL; Name stays blank; the failure is visible (not silent)
- [x] **Fetch name from page** overwrites Name with the current page title; on failure keeps the current name and shows the error
- [x] A second user cannot attach to, or refetch a title on, the first user’s row
- [x] Outline **Item ▸ Add attachment from clipboard** still works as today

## As built

- `autofillAttachmentTitleFromUrl(userId, itemId, { force })` returns `filled` / `skipped` / `fetch-failed`. Automatic path still uses `shouldAutofillAttachmentTitle`; force overwrites.
- `fetchAttachmentTitleAction` is the thin force wrapper; fetch failure is `Could not read the page title.`
- `updateNodeItemAction` returns `{ warning }` via `runWithData` when automatic fill cannot read the page, so the URL write still succeeds and the list can show the error.
- `DraftTextField` commits a URL-shaped paste (and unmount) on attachment URL fields — that was the silent autofill: paste never left the field, so blur never wrote.
- Attachments `ItemList`: **From clipboard** (tooltip is the existing command label) and **Fetch name from page** next to Name. Clipboard read lives in the list; attach still goes through `attachUrlsToNodeAction`. Objectives/Risks do not get the button.

## Changes from original plan

Material refinements during implementation (requirements, design, or scope). Omit pure
code polish.

| #   | Change | Why                                                                                                   |
| --- | ------ | ----------------------------------------------------------------------------------------------------- |
|     | None   | The blur-only commit was the predicted cause; force-overwrite and list error line shipped as planned. |

## Task 1: Save Spec Documentation — done

Create this folder with plan, shape, standards, and references. Pin standards commit `6192620bace854340d475553c5bb212b74e0cde4`.

## Task 2: Force title fetch in lib, then the editor control — done

- Extend the autofill helper with a force/overwrite path that still no-ops on missing/other-user/non-attachment/non-web-URL, but **does** replace a non-empty title.
- Return the title or a distinct failure so the action can tell the UI.
- Thin action next to `updateNodeItemAction`.
- ItemEditor (attachment only): **Fetch name from page** next to Name. Cross-user integration test; unit test that force overwrites and the automatic path still refuses a set name.

## Task 3: Make URL-paste autofill work, and stop swallowing fetch failure — done

Trace the Add → paste URL path end to end (DraftTextField commit, `updateNodeItemAction`, `autofillAttachmentTitleFromUrl`, `refreshItems`). Fix the actual cause. If paste never commits until blur, commit a URL-shaped paste (and unmount) so leaving the field is not required. If fetch returns null, surface it on the list instead of looking like a no-op. Automatic fill still must not overwrite a name the user typed (`shouldAutofillAttachmentTitle`).

## Task 4: From clipboard on the Attachments list — done

Optional `onAttachFromClipboard` on `ItemList`, wired only from the attachment `list()` in `NodeDetailDrawerBody`. Read clipboard → `clipboardAttachRefusal` → `attachUrlsToNodeAction` → `refreshItems`. Reuse `useAttachFromClipboard` only if it can report into the list error/status line without a second dialog; otherwise a small parent callback is fine — do not copy `attachUrlsToNode`.

## Task 5: Verify, freeze spec, update roadmap — done

Browser (Learn Spanish project drawer): From clipboard unreadable → list error `Could not read the clipboard.`; Objectives/Risks have no clipboard button; paste `https://example.com` into URL filled Name with `Example Domain` without leaving the field; Fetch name from page overwrote `Temporary name`; Fetch disabled with `URL is blank` when empty; outline row menu still has **Add attachment from clipboard**. Multi-URL / dupe / force-fetch-fail / cross-user covered by `attachUrls` and `detail/mutations` integration tests (headless Chrome would not grant clipboard read, so the success clip path was not clicked in the browser). Roadmap attachments line stays “links only”; no phase change.

## Follow-ups (new work — not amendments to this frozen spec)

None.
