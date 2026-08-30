# References for Attachment clipboard button, title autofill, and fetch-name

## Governing specs

### `agent-os/specs/2026-08-17-0927-attach-from-clipboard/`

- **Relationship:** Extends — the attach implementation and outline command stay; this adds the form-side button that spec omitted so attach could skip the drawer
- **Relevant decisions:** links only; `attachUrlsToNode`; clipboard enablement is about the row not the clip; skip already-attached URLs; title autofill on create; projects/tasks only

### `agent-os/specs/2026-08-08-0932-task-name-url-links/`

- **Relationship:** Extends — same title source as attachment URL-field autofill
- **Relevant decisions:** `fetchPageTitle` / `extractPageTitle`; do not overwrite an existing attachment title on the _automatic_ path; network never inside a DB transaction

### `agent-os/specs/2026-07-27-1318-per-type-detail-forms/`

- **Relationship:** Extends — attachment row shape
- **Relevant decisions:** title + URL on `node_items` kind `attachment`; no upload; ItemList is the one repeating-list renderer

## Similar implementations

### Outline clipboard attach

- **Location:** `src/components/grid/useAttachFromClipboard.tsx`, `src/lib/url/clipboardAttach.ts`, `src/lib/url/attachUrls.ts`
- **Relevance:** Read clipboard → refuse non-URL → `attachUrlsToNodeAction`. Drawer button must call this attach, not a second insert. Failures in the drawer go to ItemList’s error line rather than this hook’s NoticeDialog.

### Attachment title autofill

- **Location:** `src/lib/url/pageTitle.ts` (`shouldAutofillAttachmentTitle`, `fetchPageTitle`), `src/lib/detail/mutations.ts` (`autofillAttachmentTitleFromUrl`), `src/app/plan/outline/detail-actions.ts` (`updateNodeItemAction`, `createNodeItemAction`)
- **Relevance:** Automatic fill after a URL write. Force/overwrite is a path on this helper. `shouldAutofillAttachmentTitle` stays the blank-name guard.

### ItemList toolbar and editor

- **Location:** `src/components/detail/ItemList.tsx`, `src/components/detail/fields.tsx` (`DraftTextField`), `src/components/detail/NodeDetailDrawerBody.tsx` (`list()`, `runItemAction`, `refreshItems`)
- **Relevance:** CSV Export/Import/Add live in the list header — From clipboard joins them for `kind === "attachment"` only. URL fields commit on blur today; paste-without-blur is a suspected autofill miss. Fetch-name lands in the expanded editor next to Name.
