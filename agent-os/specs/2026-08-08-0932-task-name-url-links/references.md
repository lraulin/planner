# References for Task name URL → attachment

## Similar implementations

### Attachment page-title autofill

- **Location:** `src/lib/url/pageTitle.ts`, `src/lib/url/pageTitle.test.ts`
- **Relevance:** Canonical `normalizeHttpUrl`, `fetchPageTitle`, `extractPageTitle`
- **Key patterns:** Fail soft on network; prefer document `<title>` over og/twitter; 4s timeout

### Autofill hook on attachment create/update

- **Location:** `src/lib/detail/mutations.ts` (`autofillAttachmentTitleFromUrl`),
  `src/app/outline/detail-actions.ts` (`createNodeItemAction`, `updateNodeItemAction`)
- **Relevance:** When blank name + URL → fill title; never overwrite an existing name
- **Key patterns:** Called after write, outside the insert transaction for the item

### Task name write paths

- **Location:** `src/lib/tree/mutations.ts` (`createNode`, `renameNode`)
- **Relevance:** Single place to hook so outline rename, capture, and agent create all promote
- **Note:** Outline UI creates blank rows then renames — rename must promote

### Capture

- **Location:** `src/lib/capture/mutations.ts` (`captureItems` → `createNode` with name)
- **Relevance:** Pasting a URL into the `c` box is a primary capture habit

### Agent create

- **Location:** `src/lib/agent/outlineTools.ts` (`createNodeTool`)
- **Relevance:** Creates with name via `createNode`; inherits promote if hooked there

## Related product / specs

- Attachments MVP notes in `agent-os/product/roadmap.md` (links only, no blob store)
- Inbox capture: `agent-os/specs/2026-07-30-1018-inbox-quick-capture/`
