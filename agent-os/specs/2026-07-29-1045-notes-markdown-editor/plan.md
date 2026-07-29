# Notes tab with a markdown editor

**Status: frozen / complete** (2026-07-29)
Spec folder: `agent-os/specs/2026-07-29-1045-notes-markdown-editor/`

This document is the durable record of **what was built and why**. Future work that
extends notes should open a new delta-spec (or amend with a dated change section)
rather than treating this file as a living control plane.

## Context

`Notes` was the last Achieve tab still stubbed out. It is finished for completeness, and
upgraded from Achieve's RTF box to a **markdown** editor so the planner is worth using as
the single place to write things down rather than one more app that almost does it.

Achieve's Notes tab (`screenshots/notes/`) is a grid of nested notes — Flag, Title,
Subject, Date, Contexts — plus an always-present panel showing the selected note's text and
a modal "Note Information" form for the full record.

Its **View** dropdown conflates three unrelated axes and gets one of them wrong; the
reasoning, and everything else decided during shaping, is in `shape.md`. Read that before
this file.

## Decisions

Full reasoning in `shape.md`. In brief:

- **Drawer only**, no always-present preview panel — made viable by **autosave** (a note
  has nothing to validate) and a **body-snippet column** (what the panel is really for).
  The panel is a deliberate follow-up, not an oversight.
- **Edit / Preview toggle inside the drawer**, not a split — 720px is good for prose and
  too narrow for side-by-side.
- **Three independent controls** replace Achieve's View dropdown: `Nested | Flat`,
  `Sort: Manual | Title | Date`, and filtering. Manual sort is offered only when nested.
- **New `notes` table, not a fifth `node_type`** — notes carry no priority, effort, or
  state, and a fifth type would leak into every keep-filter and rollup in the app.
- **Generalise `DataGrid` over its row payload** rather than hand-rolling a second grid.
  Type parameters get `OutlineNode` defaults so existing call sites compile unchanged.
- **`react-markdown` + `remark-gfm`, and no `rehype-raw`** — that omission is what keeps
  raw HTML in a note from executing, so no sanitizer is needed.
- **`MarkdownEditor` owns no persistence** (controlled `value` + `onChange`). The note
  drawer wraps it in autosave; the node forms keep draft-then-Save. This is what makes
  Task 7's reuse possible at all.
- **Node linking is in**, split so the reverse surface can be dropped alone.
- **Node `notes` fields are _not_ merged into the Notes grid as pseudo-rows** — considered
  and rejected; the table of why is in `shape.md`. The want underneath is cross-cutting
  search, which is separate work.

## Acceptance criteria

- [x] Notes tab is reachable at `/notes`; `TabStrip` marks it built.
- [x] Create, rename, edit, nest, reorder, and delete notes; deleting prompts first.
- [x] Note body is markdown, autosaved, with an Edit/Preview toggle and a save-status line.
      A failed autosave keeps the text on screen and says so.
- [x] GFM renders: tables, task lists, strikethrough, fenced code. Raw HTML does not.
- [x] Grid shows Flag, Title, Snippet, Subject, Date, Contexts, Linked to; Show Fields
      hides them; column filters and sort work.
- [x] `Nested | Flat` and `Sort` are independent, and filtering is independent of both.
- [x] Filter dialog searches text across title **and** body, plus Subject and Contexts,
      with Match All / Match Any.
- [x] A note can be linked to a node; that node's drawer lists its notes and links out.
- [x] `/notes?note=<id>` deep-links straight to an open drawer.
- [x] Markdown editing is available on the node forms' long-form prose fields.
- [x] A second user cannot read, change, or delete the first user's notes.
- [x] `npm run typecheck`, `npm run lint`, and `npm test` all green with Postgres up.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                | Why                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Added Task 7 — reuse the markdown editor for node prose fields        | Raised during shaping: every node already has a `notes` field plus long-form prose. Once the editor and `.md-body` styles exist this is a prop on the shared `TextArea`, not new machinery. Forced the decision that `MarkdownEditor` owns no persistence.                                       |
| 2   | Explicitly ruled out surfacing node `notes` as rows in the Notes grid | Also raised during shaping. Delete, rename, metadata, and reordering cannot mean the same thing for both row kinds; see the table in `shape.md`. The underlying want is cross-cutting search.                                                                                                    |
| 3   | Subject is a combobox, not a plain text field                         | Clarified during implementation: Achieve lets you type a new Subject _or_ pick an existing one, with "General" always offered. Built as a native `<input list>` + `<datalist>` — free text, keyboard-friendly, no dependency. Option list is the distinct subjects in use plus "General".        |
| 4   | Migration `0006_notes.sql` hand-written rather than generated         | `drizzle-kit generate` cannot run: migrations `0004` and `0005` were hand-written without snapshots, so drizzle's latest snapshot is `0003` and it prompts to re-apply both. Pre-existing drift, not caused here. Followed the established hand-written pattern; snapshot repair is a follow-up. |
| 5   | Project and Task freeform notes moved onto a shared Notes tab         | Goal and Result Area already had a Notes tab; Project/Task kept freeform notes on General. Reverse-surface work put freeform + linked notes together on one Notes tab for all four types so "notes about this record" is one place.                                                              |
| 6   | Linked notes loaded with a scoped query inside `loadNodeDetail`       | Plan mentioned `loadNotesForNode` (filter full tree). Direct `notes` select scoped by `(userId, nodeId)` is cheaper per drawer open and still user-scoped.                                                                                                                                       |

---

## Task 1: Save spec documentation

Create this folder with `plan.md` (**Status: active**), `shape.md`, `standards.md`, and
`references.md`. `screenshots/notes/` is referenced in place rather than copied into
`visuals/`.

## Task 2: Data layer

**Schema** (`src/db/schema.ts`) — `noteFlagEnum` (`none`, `done`, `blue`, `cyan`, `green`,
`orange`, `purple`, `red`, `yellow` — the set in the Flag dropdown screenshot) and a `notes`
table:

- `id`, `userId` → `users` cascade, `parentId` → `notes.id` cascade (self-referencing, same
  `AnyPgColumn` pattern as `nodes.parentId`)
- `sortKey`, `title`, `subject`, `body` (markdown source), `noteDate` (timestamptz),
  `flag`, `contexts` (`text[]`), `collapsed`, `nodeId` → `nodes.id` **on delete set null**
- index `(userId, parentId, sortKey)`, index `(userId, nodeId)`, and
  `unique(userId, parentId, sortKey).nullsNotDistinct()` — copy the `nodes` constraint
  exactly so root notes are covered

Then `npm run db:generate`.

**`src/lib/notes/queries.ts`** — `loadNotes(userId)` in depth-first order. Model on
`loadOutline` (`src/lib/tree/queries.ts:13`): recursive CTE accumulating a `sort_key` path
array, `ORDER BY path`, plus a `LEFT JOIN nodes` for the linked node's name and type.

**`src/lib/notes/mutations.ts`** — `createNote` (parent + after-sibling positioning),
`updateNote` (partial patch, modelled on `updateAppointment`), `deleteNote`, `moveNote`
(reparent + reorder), `setNoteCollapsed`. Every one takes `userId` first and scopes every
`where` by it. Reuse `src/lib/tree/sortKey.ts` for ordering.

**`src/lib/notes/mutations.integration.test.ts`** — real Postgres via
`src/lib/testing/database.ts`. **Required:** a second user tries to read, update, and delete
the first user's note and fails at all three. Also cover reparenting, that deleting a note
takes its subtree, and that deleting a linked `node` nulls `nodeId` rather than deleting the
note.

## Task 3: Pure logic in `src/lib/notes/`

Each with an adjacent `*.test.ts`.

- **`snippet.ts`** — markdown → single-line plain text for the grid. Strips headings,
  emphasis, link syntax (keeping label text), fenced code, blockquote markers, list
  bullets; collapses whitespace; truncates on a word boundary. Test the plausible-looking
  wrong answers: a note opening with a fenced code block, a link-only first line, a heading
  followed by a blank line.
- **`slice.ts`** — nested notes → flat rows. Handles `Nested | Flat`, `collapsed` subtree
  hiding, and sort, with sort applying **within siblings** when nested and across all rows
  when flat. Model on `src/lib/tree/slice.ts`.
- **`filter.ts`** — the Note Item Filter predicate: text over title and/or body, Subject,
  Contexts, and Match All / Match Any. Test that All and Any genuinely differ and that an
  empty filter passes everything.
- **`editing.ts`** — textarea helpers as pure `(text, selection) → { text, selection }`:
  Enter continuing `-`, `1.`, and `- [ ]` lists — and **clearing** the marker on an empty
  list item rather than adding another — plus Tab/Shift+Tab indent and bold/italic wrapping.

## Task 4: Generalise `DataGrid` over its row payload

Backward-compatible type plumbing; no behaviour change to any existing tab.

- `src/lib/tree/slice.ts` — `GridRow<T = OutlineNode>`, node-variant payload typed `T`,
  `context` optional.
- `src/components/grid/columns.ts` — `NodeGridRow<T = OutlineNode>`,
  `ColumnDef<TCtx, TRow = OutlineNode>`.
- `src/components/grid/DataGrid.tsx` — `DataGrid<TCtx, TRow = OutlineNode>`. Lift the two
  `OutlineNode`-specific reads to optional props: `rowLabel?: (row) => string` (currently
  `` `${TYPE_LABELS[node.type]}: ${name}` ``) and `rowExpansion?: (row) => boolean |
undefined` (currently `hasChildren ? !collapsed : undefined`). Defaults reproduce today's
  output. `buildNodeDepths` is already structural — leave it.
- `ColumnHeader.tsx`, `useGridColumns.ts`, `ShowFieldsDialog.tsx` — thread the parameter.

No call site passes explicit type arguments today (verified), so `OutlineGrid`,
`ProjectsGrid`, `TasksGrid`, and `GoalsGrid` should need no edits.

**Gate: `npm run typecheck` and `npm test` green before moving on. If this starts rippling
into those four tabs, stop and hand-roll the notes grid instead** — Notes is a completeness
feature and is not worth destabilising four working tabs.

## Task 5: Notes tab UI

- **`src/app/notes/page.tsx`** — server component: `getCurrentUserId`, `loadNotes`,
  `loadOutline` (for the link picker), `TabStrip active="notes"`,
  `dynamic = "force-dynamic"`. Reads `?note=<id>` to open the drawer directly. Mirror
  `src/app/schedule/page.tsx`.
- **`src/app/notes/actions.ts`** — thin server actions returning `{ ok: false, error }`
  rather than throwing, with `revalidatePath`. Follow `src/app/schedule/actions.ts`.
- **`src/components/notes/notesColumns.tsx`** — Flag (colour chip + inline select), Title
  (expander, indent, inline rename), Snippet (read-only), Subject, Date, Contexts, Linked
  to; with filter and sort values per column.
- **`src/components/notes/NotesGrid.tsx`** — host: toolbar (`Nested | Flat`, Sort,
  `Filter…`, `New note`, Show Fields), selection, optimistic patching, drag-to-reorder via
  `RowDrag`, context menu. Keyboard per Achieve's hint bar and `ux-principles.md`:
  `Enter` / double-click opens the drawer, `F2` renames inline, `Insert` new sibling,
  `Ctrl+Insert` new child, `Tab`/`Shift+Tab` indent/outdent, `Delete` behind a
  `ConfirmDialog`.
- **`src/components/notes/NoteFilterDialog.tsx`** — the Note Item Filter, driven by
  `lib/notes/filter.ts`.
- **`TabStrip.tsx`** — flip Notes to `built: true, href: "/notes"`.

## Task 6: Markdown editor + note drawer

- `npm i react-markdown remark-gfm`.
- **`src/components/notes/MarkdownPreview.tsx`** — `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
  in a `.md-body` wrapper. **Do not add `rehype-raw`.**
- **`src/app/globals.css`** — one `.md-body` block styling headings, lists, task-list
  checkboxes, code and `pre`, blockquote, table, and `hr` from the existing tokens
  (`--ink`, `--ink-muted`, `--rule`, `--surface-raised`). Must read correctly in light and
  dark, which the file already handles via `prefers-color-scheme`. No typography plugin.
- **`src/components/notes/MarkdownEditor.tsx`** — textarea wired to `lib/notes/editing.ts`,
  with an Edit | Preview toggle. **Controlled `value` + `onChange`; owns no persistence** —
  Task 7 depends on this.
- **`src/components/notes/NoteDrawer.tsx`** — shared `Drawer` + `DrawerHeader`. Title,
  Subject, Date, Flag, Contexts (reuse `ContextsField`, `src/components/detail/fields.tsx:575`),
  the linked-node picker, then the editor. **Autosave**: ~800 ms debounce, flushed on close
  and unmount. Footer is a status line — `Saving… / Saved · Xs ago / Couldn't save — Retry`
  — not `DrawerFooter`, and there is no unsaved-changes dialog. A failed save keeps the text
  and the drawer open. Keyed on note id.

## Task 7: Reuse the markdown editor across node prose fields

- Add an optional `markdown` prop to `TextArea` in `src/components/detail/fields.tsx` that
  adds the Edit/Preview toggle and renders through `MarkdownPreview`.
- Turn it on for the genuinely long-form fields: the **Notes** field on all four node forms,
  appointment notes in `AppointmentDrawer`, and mission / vision / strategy / definition /
  purpose / description. Leave short fields plain.
- The node forms keep draft-then-Save unchanged — only the editing surface changes.

## Task 8: Link notes to nodes (droppable)

- Link picker in `NoteDrawer` (a select over the loaded outline, like `ProjectsGrid`'s scope
  picker), a "Linked to" grid column, and scope-by-node filtering.
- **Reverse surface** — a shared `Notes` tab appended to `resultAreaTabs`, `goalTabs`,
  `projectTabs`, and `taskTabs`: a **read-only** list of linked notes (title, date, snippet)
  plus a "New note" button, each row linking to `/notes?note=<id>`. Requires extending
  `NodeDetail` and `loadNodeDetail` (`src/lib/detail/queries.ts`) to carry linked notes.
  Deliberately not an embedded editor — a drawer over a drawer is what `ux-principles.md`
  rules out.

If this grows beyond that, ship the picker and column and move the reverse surface to
follow-ups.

## Task 9: Verify, freeze spec, update roadmap

- `npm run typecheck`, `npm run lint`, and `npm test` **with `npm run db:up` running** — a
  green `test:unit` does not mean the notes integration tests ran. Check for the skip
  warning.
- Drive the app with the `run-planner` skill: create a note, nest one under it, write
  markdown with a table and a task list, confirm preview and autosave, reload to confirm
  persistence, filter by body text, flip Nested/Flat and sort, link a note to a project and
  reach it from that project's drawer, and confirm a node form's Notes field renders
  markdown.
- Update `plan.md` / `shape.md` for material as-built drift; complete **Changes from
  original plan**.
- Mark `plan.md` and `shape.md` **Status: frozen / complete (YYYY-MM-DD)**; move leftovers
  to **Follow-ups**.
- `agent-os/product/roadmap.md`: move Notes into Phase 1 **Delivered** with a one-line
  as-built summary and this folder's path.

---

## Follow-ups (new work — not amendments to this spec)

Filled at freeze. Expected candidates:

- The always-present preview panel, if the snippet column turns out not to be enough.
- **Cross-cutting search** over node names, node notes, and note bodies — the real answer
  to "I wrote that somewhere". Already on the roadmap as Phase 1 friction.
- Note templates, cross-note `[[wiki links]]`, attachments, markdown export.

---

> Spec is **frozen**. Material follow-ups belong in a new delta-spec or the Follow-ups
> list above — not as open edits to this folder.
