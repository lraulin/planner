# References for Brain

## Governing specs

None — root spec.

## Similar Implementations

### Houses

- **Location:** `agent-os/specs/2026-09-17-0853-houses-library-page/`, `src/lib/houses/`, `src/lib/agent/houseTools.ts`
- **Relevance:** Last new Library page plus a new MCP domain.
- **Key patterns:** `PageEntry` registration (`pages.ts`, `pages.test.ts`, `cachePolicy.ts`); domain contracts; hardcoded tool counts that must move together; per-field `.describe()` where names collide with global descriptions.

### Timeline ribbon

- **Location:** `agent-os/specs/2026-08-14-1724-timeline-ribbon/`, `src/components/timeline/TimelineRibbon.tsx`, `src/lib/timeline/ribbon.ts`
- **Relevance:** Hand-built visualisation, pure layout in lib, `useElementSize`.
- **Key patterns:** No chart library; `chartCatVar` for category colours.

### Notes editor

- **Location:** `agent-os/specs/2026-07-29-1045-notes-markdown-editor/`, `src/components/notes/MarkdownEditor.tsx`, `useAutosave.ts`
- **Relevance:** The per-thought note pane.
- **Key patterns:** Controlled `MarkdownEditor` wrapped in `useAutosave` (flush on close, never report saved while newer edit pending).

### Composite user FK

- **Location:** `src/db/schema.ts` (`finance_scenario_lines_scenario_user_fk`)
- **Relevance:** Makes a cross-user link unrepresentable.
