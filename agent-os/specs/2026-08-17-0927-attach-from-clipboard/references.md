# References for Add attachment from clipboard

## Governing specs

### `agent-os/specs/2026-08-08-0932-task-name-url-links/`

- **Relationship:** Extends — URL extract, title fetch, dedup, links-only model
- **Relevant decisions:** `extractHttpUrls` / `normalizeHttpUrl` / `fetchPageTitle`; insert via `db` + `between` to avoid the tree↔detail cycle; no overwrite of an existing attachment title

### `agent-os/specs/2026-08-06-1010-command-surface/` and `agent-os/specs/2026-08-13-1050-menu-completeness/`

- **Relationship:** Extends — placement is a property of the command
- **Relevant decisions:** `menu` + `section` required; `rowMenu` opts the verb onto right-click; same label on every surface

### `agent-os/specs/2026-08-06-1506-right-click-completion/`

- **Relationship:** Extends — right-click is the row-scoped path
- **Relevant decisions:** unavailable is disabled with a reason; right-click of an unselected row describes that row

### `agent-os/specs/2026-07-27-1318-per-type-detail-forms/`

- **Relationship:** Extends — attachment row shape
- **Relevant decisions:** title + URL on `node_items` kind `attachment`; no upload

## Similar implementations

### URL extract (client-safe)

- **Location:** `src/lib/url/extractHttpUrls.ts`, `src/lib/url/clipboardAttach.ts`
- **Relevance:** Pure extract/rewrite, split out so the clipboard command can refuse a non-URL without bundling `db`

### Task name URL → attachment

- **Location:** `src/lib/url/taskNameLinks.ts`
- **Relevance:** The insert/dedup pattern to copy (without rewriting the name). Re-exports extract for existing callers.

### Attachment title autofill

- **Location:** `src/lib/url/pageTitle.ts`, `src/lib/detail/mutations.ts` (`autofillAttachmentTitleFromUrl`)
- **Relevance:** Same title source; fail soft on network

### Grid command deck

- **Location:** `src/lib/grid/commandDeck.ts`, `src/components/grid/useNodeCommandDeck.tsx`
- **Relevance:** Where item verbs are declared once and rendered on every surface

### Copy as text / export clipboard

- **Location:** `src/lib/tree/copyAsText.ts`, `agent-os/specs/2026-08-14-1045-export-clipboard/`
- **Relevance:** Silent clipboard success; no toast
