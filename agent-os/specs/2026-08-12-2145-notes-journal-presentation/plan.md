# Notes journal presentation

**Status: frozen / complete** (2026-08-12)  
Spec folder: `agent-os/specs/2026-08-12-2145-notes-journal-presentation/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-29-1045-notes-markdown-editor/` — same `notes` table, markdown editor, autosave
- **Extends:** `agent-os/specs/2026-07-31-1245-day-tab/` — a daily journal is still one `notes` row with `subject = "Journal"` and `noteDate` = that calendar day; `saveJournal` is the write path. The Day **surface** is shelved; the data contract is live
- **Extends:** `agent-os/specs/2026-08-03-1518-rednotebook-journal-import/` — delivers the deferred “calendar tree view” as a **real tree**, not folder notes and not grouped DataGrid rows. Rednotebook rows stay flat `subject = "Rednotebook"`
- **Extends:** `agent-os/specs/2026-08-10-1940-daily-use-performance/` — list summaries only; load the body when a day/entry is selected; autosave must not RSC-refresh the route
- **Extends:** `agent-os/specs/2026-08-12-1910-schedule-day-counts-agenda/` — in-module **presentation** switch (Calendar | Agenda). Notes gets Grid | Journal the same way
- **Extends:** `agent-os/specs/2026-08-05-1059-views-across-modules/` — nav destinations are **modules**; a **View** is a saved filter/column collection. This work is neither
- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — presentation + selected date persistence rules
- **Extends:** `agent-os/specs/2026-07-31-1938-responsive-mobile/` — compact is a different IA, not a squashed desktop
- **Does not supersede:** `agent-os/specs/2026-08-07-2129-notes-column-grouping/` — Year/Month/Day grouping stays on the **grid** presentation

## Context

Notes is a grid of nested notes. The Day page already writes one Journal note per calendar day on first keystroke, and RedNotebook imports land as dated `Rednotebook` notes. What is missing is the diary **layout**: pick a day, see dated entries as a tree, and just type.

This is not a new module and not a saved View. It is a second presentation of the Notes module, modelled on The Journal (calendar + date tree + write pane) and on our own Schedule Calendar | Agenda switch.

Lee’s broader terminology / intra-module subdivision UX is **out of scope**. This spec only names what _this_ switch is.

## Decisions

### Terminology (this spec only)

| Word             | Meaning here                                            |
| ---------------- | ------------------------------------------------------- |
| **Module**       | Notes (`/notes`)                                        |
| **View**         | A saved collection of filter / column / switch settings |
| **Presentation** | Grid vs Journal layout of the same module               |

Do not rename Views to “lenses” here. Do not add a third nav item.

### Data

- **No new table.** Journal and Rednotebook remain ordinary `notes` rows.
- **Journal slot** = at most one note per user per calendar day with `subject = "Journal"` (existing `saveJournal` / `loadJournal`). Title stays the date key (`YYYY-MM-DD`).
- **Rednotebook archive** = dated notes with `subject = "Rednotebook"`. A day may have more than one (import appends).
- Day’s Daily Notes pane and this presentation **are the same Journal row**. Type in one, the other shows it for that day.
- Other notes (General, nested project notes, etc.) stay on the grid presentation only.

### Create-on-type (do not mint blank days)

- Opening today, or clicking a day with no Journal, shows an **empty editor**. Nothing is written.
- First persist of **non-whitespace** body creates the Journal note via `saveJournal`.
- Whitespace-only must **not** insert.
- `saveJournal` is tightened to that rule so Day cannot create blanks either. Day today only writes on `onChange`; the mutation still must refuse an empty insert so a stray save cannot mint a day.
- Updating an existing Journal to empty is allowed (do not delete-on-clear). Tree and calendar treat whitespace-only as **no journal entry**.

### Layout (The Journal, minus categories)

Reference: shaping screenshot (four theme variants of the same window). Copy into `visuals/the-journal-reference.png`.

Desktop (`md+`):

1. **Left rail**
   - Mini-month (reuse `MiniMonth`, add optional marked-day set). Today selected on arrival.
   - Days with a non-empty Journal or Rednotebook body are marked.
   - **Real date tree under the calendar** — not a grouped DataGrid, not Notes Nested mode. Year → Month → entry leaves. **No root above year.** No Journal/Rednotebook category roots.
   - Newest year / month first (same as Notes calendar grouping).
   - A day with one note is one leaf (`23` plus snippet). A day with Journal **and** Rednotebook (or several Rednotebooks) is one leaf per note.
2. **Write pane**
   - Markdown editor + existing autosave.
   - Calendar click always focuses that day’s **Journal slot** (empty until you type).
   - Tree click opens **that** note. Editing a Rednotebook row updates that note (`updateNote`), it does not create a Journal.
   - Clicking the calendar after browsing a Rednotebook returns to the Journal slot for that day.

Compact (below `md`): calendar + tree is the list; tapping a day/entry opens a full-screen editor sheet. Date header stays tappable to change day. 16px input rule, 44px targets.

### Switching

- Stay on `/notes`. Default presentation remains **Grid** (existing Notes workflow).
- Lens control **Grid | Journal**, same pattern as Schedule **Calendar | Agenda**, persisted in the Notes settings scope (`presentation: "grid" | "journal"`). Not a saved View; not URL state.
- URL carries **location only**: `?date=YYYY-MM-DD` is the selected calendar day; existing `?note=` still deep-links a specific note and, if that note is Journal/Rednotebook, opens Journal presentation on its day.
- View menu commands for the two presentations (registered, not palette-only).
- The current Notes toolbar **Journal** button (subject filter on the grid) becomes **switch to Journal presentation** (or is removed once the lens exists — one path, not two).

### What we are not building

- App-wide module / view / presentation taxonomy or a standard intra-module chrome
- The Journal’s categories (Notebook, Templates), doodles, attachments, RTF
- Auto-creating an empty entry every day
- Multiple Journal entries per day
- Replacing or reviving the Day module
- Using DataGrid grouping as the date tree
- Year/month **folder notes** in storage
- A new Notes subject, schema column, or agent tool
- Month / year calendar views

## Acceptance criteria

- [x] Notes offers Grid | Journal. The choice survives reload. Default is Grid.
- [x] Journal presentation: mini-month (today selected), real Year → Month → entry tree (no root above year), write pane. Not a grouped grid.
- [x] Opening a day with no Journal writes **nothing**. Typing non-whitespace creates one `subject = "Journal"` note for that `noteDate`. Whitespace does not insert.
- [x] The same Journal row is what Day’s Daily Notes pane reads and writes for that day.
- [x] Rednotebook day notes appear in the same date tree; selecting one edits that note.
- [x] Calendar marks days that have a non-empty Journal or Rednotebook body.
- [x] Tree and calendar use `toDateKey` / `fromDateKey` (UTC noon). No `startOfDay` on `noteDate`.
- [x] List payload is summaries/snippets only; body loads on select. Autosave does not RSC-refresh `/notes`.
- [x] Compact: list (calendar + tree) → full-screen editor; inputs ≥16px; tap targets 44px.
- [x] A second user cannot read, change, or delete the first user’s diary notes. New list query is registered in `crossUserReads.integration.test.ts`.
- [x] Unit, lint, typecheck, and `npm run smoke` pass; integration tests actually ran. Browser-driven: type today, pick an empty day (no row), open a dated Journal leaf, switch Grid ↔ Journal. Production `next build` not re-run while the dev server is up.

## Changes from original plan

| #   | Change                                                        | Why                                                                                       |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | `REDNOTEBOOK_SUBJECT` lives in `src/lib/rednotebook/types.ts` | Importing it from `import.ts` pulled Postgres into the Notes client bundle                |
| 2   | Date + note URL writes are one `replace`                      | Two `setDate`/`setNote` calls raced and dropped the day, so a tree click never left today |
| 3   | The write pane is parent-controlled                           | Remounting the editor when create assigned an id wiped the text that had just saved       |
| 4   | `?date=` or a diary `?note=` writes Journal presentation      | The Day pane’s Journal link is a plain href and cannot persist a setting itself           |

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-12-2145-notes-journal-presentation/` with:

- **plan.md** — this plan, **Status: active**, empty Changes table
- **shape.md** — scope, decisions, The Journal screenshot notes, terminology side-note (out of scope beyond this spec), product alignment
- **standards.md** — **full copy** of: `development/dates.md`, `development/testing.md`, `development/clean-code.md`, `development/security.md`, `components/ux-principles.md`, `components/navigation.md`, `components/responsive.md`
- **references.md** — governing specs above plus code: `src/lib/day/{mutations,queries,types}.ts` (`saveJournal` / `loadJournal` / `JOURNAL_SUBJECT`), `src/lib/rednotebook/import.ts` (`REDNOTEBOOK_SUBJECT`), `src/lib/notes/{queries,types,snippet}.ts`, `src/components/notes/{MarkdownEditor,useAutosave,NotesGrid}.tsx`, `src/components/day/DailyNotesPane.tsx`, `src/components/schedule/{MiniMonth,ScheduleView}.tsx` (marked days + Calendar\|Agenda), `src/lib/settings/notes.ts`
- **visuals/the-journal-reference.png** — copy the shaping screenshot

While this spec is **active**, material requirement/design/scope changes update plan/shape and get a Changes row. Freeze when verified.

## Task 2: Diary query and date tree (`src/lib/notes/`)

Pure + query. No components.

- `loadDiarySummaries(userId)` — Journal + Rednotebook notes only, **no bodies**, snippet + `noteDate` + subject. SQL-filter by subject. Register in `crossUserReads`.
- `diaryTree.ts` (+ `diaryTree.test.ts`) — summaries → `{ years: { key, months: { key, entries: { id, dateKey, subject, snippet }[] }[] }[] }` plus `markedDays: Set<dateKey>`.
  - Drop undated and whitespace-only snippets/bodies.
  - Newest year/month first; entries oldest-to-newest within a day (Journal before Rednotebook when both exist, or by `createdAt` — pick one, test it).
  - No synthetic “today” leaf.
  - Calendar fixtures via `fromDateKey` / `toDateKey`. Include a DST / Aug 1 case if a date is constructed.

## Task 3: Create-on-type writes

- Tighten `saveJournal`: insert only when `body.trim()` is non-empty; existing row may update to empty; never insert a blank.
- Integration tests: empty insert is a no-op (no row); first non-empty creates; second save updates the same id; whitespace does not create; cross-user still isolated.
- Rednotebook edits go through existing `updateNote`. Do not invent a second write path.
- Day’s `DailyNotesPane` keeps calling `saveJournalAction`; it inherits the empty-insert guard.

## Task 4: Notes Grid | Journal presentation

- Extend Notes settings with `presentation: "grid" | "journal"` (default `"grid"`).
- `/notes` hosts either `NotesGrid` or a new `NotesJournal` (name the concept, not the chrome).
- `NotesJournal`: MiniMonth (optional `markedDays`) + real collapsible tree + `MarkdownEditor` / `useAutosave`. Default-expand current year, current month, and the path to the selected date.
- Selecting a day with no Journal: empty controlled editor, no id, `schedule` only after non-whitespace.
- After create, patch the tree/marks locally (no full RSC refresh) — same contract as Notes autosave in the performance spec.
- Load body with existing `loadNote` when an id is selected.

## Task 5: Persist, URL, commands, phone

- Persist `presentation` in the Notes settings scope. `?date=` is the selected day (`localDateKey` today when absent/invalid). `?note=` for a diary note selects that note and its day.
- Register View-menu / lens **Grid** and **Journal** commands on the Notes module (placement on the command, not a one-off toolbar). Remove or retarget the grid’s Journal-subject filter button so there is one way to open the diary.
- Compact: calendar+tree list → full-screen editor sheet; date control to change day. `useIsCompact()`, `--tap-target`, 16px inputs.
- Optional: Day pane “Journal” link → `/notes?date=<day>` with Journal presentation (setting write or a one-shot query is fine; do not invent a second Notes route).

## Task 6: Verify, freeze spec, update roadmap

- Confirm acceptance criteria in a real browser (`run-planner`): today create-on-type, empty day creates nothing, Rednotebook leaf opens that body, Grid ↔ Journal survives reload, Day pane shows the same Journal text.
- `npm run test:unit`, integration (no skip), lint, typecheck, build, `npm run smoke`.
- Update plan/shape for as-built drift; fill **Changes from original plan**.
- Mark **Status: frozen / complete** (date). Follow-ups as new work, not edits.
- Roadmap: record under Phase 2 / Notes as the RedNotebook calendar-tree follow-up plus a Notes presentation. Not a new module.

## Follow-ups (new work — not this spec)

- App-wide word for intra-module layouts (view vs presentation vs lens) and a shared chrome pattern
- Multiple Journal entries per day / timestamps
- Search inside the diary tree
- Virtualizing a multi-year tree if the Rednotebook archive is huge
- Reviving the Day module around this same Journal row
