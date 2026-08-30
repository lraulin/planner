# Attachment clipboard button, title autofill, and fetch-name — Shaping Notes

**Status: active**

## Scope

Three related Attachments-tab improvements, one spec:

1. **From clipboard** next to Add attachment — create attachment rows from clipboard URLs without Add → paste into URL.
2. **Fix title autofill** when a URL is pasted into the URL field (reported broken).
3. **Fetch name from page** on the expanded row — re-fetch and overwrite Name.

### Out of scope

- Screenshots / image clipboard / first-party file hosting
- Attachments tab on Goals
- Notes attachments
- Drive / Dropbox pickers
- A new registered command or dedicated chord
- Changing the outline clipboard command’s NoticeDialog

## Decisions

- Links only, using the existing extract + title-autofill path (`attachUrlsToNode`, `fetchPageTitle`)
- Form button, not a second command — `record.attach-from-clipboard` already catalogs the verb
- Drawer clipboard failures use ItemList’s error/status line (CSV Import is in the same toolbar)
- Fetch-name **overwrites** an existing name (user chose this over fill-blank-only and clear-then-fetch)
- Automatic autofill still refuses a name the user typed (`shouldAutofillAttachmentTitle`)
- Implement must find why URL-paste autofill is silent; retry is not the fix for that path
- Likely causes to check: DraftTextField commits URL only on blur; `fetchPageTitle` returns null with no UI

## Context

- **Visuals:** Attachments tab from the drawer-clipping report — toolbar is CSV Export, CSV Import, Add attachment. No separate mockup.
- **References:** `useAttachFromClipboard.tsx`, `clipboardAttach.ts`, `attachUrls.ts`, `pageTitle.ts`, `ItemList.tsx`, `detail-actions.ts` (`updateNodeItemAction` / `attachUrlsToNodeAction`), `autofillAttachmentTitleFromUrl`
- **Product alignment:** Capture-quality on the Phase 2 attachments MVP (links only). No roadmap phase change.

Shaping Q&A: one spec covering all three (yes); retry overwrites the current name (yes).

## Standards Applied

- **components/drawer-pattern** — list rows write through; drawer stays open
- **components/ux-principles** — immediate feedback; no toast; labelled button
- **components/navigation** — do not ship a second command for the same verb
- **development/clean-code** — one attach implementation; logic in `src/lib`
- **development/testing** — pure + integration with cross-user; no component tests
- **development/security** — every write scoped by `userId`
