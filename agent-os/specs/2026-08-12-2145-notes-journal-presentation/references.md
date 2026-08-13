# References for Notes journal presentation

## Governing specs

### `agent-os/specs/2026-07-29-1045-notes-markdown-editor/`

- **Relationship:** Extends
- **Relevant decisions:** `notes` table (not a node type), markdown + autosave, drawer
  editing, no always-on preview panel

### `agent-os/specs/2026-07-31-1245-day-tab/`

- **Relationship:** Extends (data contract only; Day surface is shelved)
- **Relevant decisions:** Journal is a `notes` row with `subject = "Journal"` and
  `noteDate` = the day; `saveJournal` creates on first keystroke

### `agent-os/specs/2026-08-03-1518-rednotebook-journal-import/`

- **Relationship:** Extends — delivers the deferred calendar tree **view**
- **Relevant decisions:** Flat `subject = "Rednotebook"` notes; no year/month folder
  records; Day journals stay separate

### `agent-os/specs/2026-08-07-2129-notes-column-grouping/`

- **Relationship:** Does not supersede
- **Relevant decisions:** Year/Month/Day grouping stays on the **grid** presentation

### `agent-os/specs/2026-08-10-1940-daily-use-performance/`

- **Relationship:** Extends
- **Relevant decisions:** List summaries only; body on demand; autosave must not
  RSC-refresh `/notes`

### `agent-os/specs/2026-08-12-1910-schedule-day-counts-agenda/`

- **Relationship:** Extends (pattern)
- **Relevant decisions:** In-module presentation switch; URL carries location; mode is a
  setting

### `agent-os/specs/2026-08-05-1059-views-across-modules/`

- **Relationship:** Extends (terminology)
- **Relevant decisions:** Nav destinations are modules; a View is a saved filter collection

### `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

- **Relationship:** Extends
- **Relevant decisions:** Settings in Postgres; URL is location

### `agent-os/specs/2026-07-31-1938-responsive-mobile/`

- **Relationship:** Extends
- **Relevant decisions:** Compact is a different IA (`list → sheet`)

## Similar implementations

### Day journal write path

- **Location:** `src/lib/day/{mutations,queries,types}.ts`, `src/components/day/DailyNotesPane.tsx`
- **Relevance:** `JOURNAL_SUBJECT`, `saveJournal`, `loadJournal`, create-on-type editor
- **Key patterns:** Ordinary note row; autosave; no Save button

### RedNotebook import

- **Location:** `src/lib/rednotebook/import.ts`
- **Relevance:** `REDNOTEBOOK_SUBJECT`; multiple notes per day possible
- **Key patterns:** Flat dated notes, title = date key

### Notes list + editor

- **Location:** `src/lib/notes/{queries,types,snippet}.ts`, `src/components/notes/{MarkdownEditor,useAutosave,NotesGrid}.tsx`
- **Relevance:** Summaries vs detail, autosave without route refresh
- **Key patterns:** `loadNote` / `loadNoteSummary` / `updateNoteAction` `{ revalidate: [] }`

### Schedule presentation switch + mini-month

- **Location:** `src/components/schedule/{MiniMonth,ScheduleView}.tsx`, `src/lib/settings/schedule.ts`
- **Relevance:** Calendar | Agenda lens; mini-month to extend with marked days
- **Key patterns:** Segmented control on the lens row; `viewMode` is a setting

### Notes settings

- **Location:** `src/lib/settings/notes.ts`
- **Relevance:** Where `presentation` is stored (module default scope)
