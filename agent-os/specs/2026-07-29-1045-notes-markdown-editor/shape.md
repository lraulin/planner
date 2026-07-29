# Notes tab with a markdown editor — Shaping Notes

**Status: frozen / complete** (2026-07-29)

## Scope

The **Notes** tab — the last Achieve tab that was still stubbed out. Built to Achieve's
model, with the note body upgraded from Achieve's RTF box to **markdown**, so the planner
is worth using as a single place to write things down.

In scope:

- A `notes` table: nested notes with Title, Subject, Date, Flag, Contexts, and a markdown
  body.
- A Notes tab at `/notes` — grid + drawer, matching the rest of the app.
- Markdown editing with an Edit/Preview toggle and GFM (tables, task lists, strikethrough,
  fenced code).
- Filtering and search across title and body, plus Subject and Contexts.
- An optional link from a note to a node (result area / goal / project / task), and a
  read-only list of a node's linked notes inside its detail drawer.
- Reuse of the markdown editor for the prose fields already on the node forms.

### Out of scope

- **An always-present preview panel** (Achieve has one). Deliberately deferred — see below.
- **Merging `nodes.notes` into the Notes tab.** Considered and rejected — see below.
- Note templates, cross-note `[[wiki links]]`, attachments, export.
- Full-text search across the whole app. Related and wanted, but it is its own feature and
  already sits on the roadmap as Phase 1 friction ("find-in-outline").

## Decisions

### Achieve's View dropdown conflates three unrelated axes

Achieve offers **Simple List / Sort by Title / Sort by Date / Outline**. That single control
is really deciding three separate things at once:

| Axis              | What Achieve does                                                            |
| ----------------- | ---------------------------------------------------------------------------- |
| Panel orientation | "Outline" puts the note text to the right; the other three put it underneath |
| Sort order        | Two of the four names are sort orders                                        |
| Hierarchy         | **None.** All four views are nested                                          |

So "Simple List" versus "Outline" promises a flat-versus-nested distinction it never
delivers, and there is no reason filtering should depend on orientation or vice versa.

We split them into independent controls — **`Nested | Flat`**, **`Sort: Manual | Title |
Date`**, and **filtering** — and add the genuinely flat option the names falsely implied.
Manual sort is only meaningful when nested, so it is only offered there.

### Drawer only — no always-present preview panel

Every other tab in this app is grid + right-sliding drawer (`ux-principles.md`,
`drawer-pattern.md`). Notes could have argued for an exception, because a note's body _is_
the record rather than a field of it. Two changes make the drawer work anyway:

1. **Autosave.** A note has nothing to validate — no cross-field constraints, no parse
   failures, nothing a server can reject on content grounds. Saving on a debounce removes
   the unsaved-changes prompt, which is the single thing that makes a drawer feel wrong for
   long-form writing. Escape-to-close stops being risky; the drawer becomes an editor you
   close rather than a form you submit.
2. **A body-snippet column.** Achieve _needs_ its panel because its grid shows only
   Title / Subject / Date / Flag / Contexts — no body text at all, so two notes are
   indistinguishable while scanning. A plain-text snippet column solves most of that far
   more cheaply, and unlike a panel it also works in a flat sorted list.

What the panel still buys is "read a note without opening it", which is weak once opening
is instant and closing has no save ceremony. **Ship without it and add it only if it is
actually missed** — cheaper than building it and discovering it is dead weight.

Consequence: the drawer caps at 720px per `drawer-pattern.md`. That is a good measure for
prose but too narrow for side-by-side source and preview, so markdown gets an **Edit /
Preview toggle**, not a split.

### A new `notes` table, not a fifth `node_type`

Notes are not part of the Result Area → Goal → Project → Task hierarchy. Adding a fifth
type would leak into every keep-filter, hierarchy rule, effort rollup, and grid tab that
currently switches on `NodeType` — for rows that have no priority, no effort, and no state.
Separate table, same lexicographic `sortKey` machinery from `src/lib/tree/sortKey.ts`.

### Generalise `DataGrid` rather than hand-rolling

`WishesGrid` hand-rolled its own grid because its rows are `node_items`, not `nodes`. Notes
want sort, column filters, nesting with collapse, drag-to-reorder, a context menu, and Show
Fields — nearly all of `DataGrid`. Hand-rolling would duplicate a second filter
implementation.

Instead, make the row payload a type parameter with `OutlineNode` as its default, so every
existing call site compiles unchanged. Two `OutlineNode`-specific reads inside `DataGrid`
(the ARIA label and the expanded state) lift out to optional props whose defaults reproduce
today's output.

**Abort condition:** if this refactor starts rippling into the four working tabs, stop and
hand-roll the notes grid. Notes is a completeness feature; it is not worth destabilising
Outline, Projects, Tasks, and Goals.

### `react-markdown` + `remark-gfm`, and no `rehype-raw`

Two small dependencies, and the source text stays what you actually edit — unlike a WYSIWYG
that stores markdown. react-markdown does not render raw HTML unless `rehype-raw` is added,
so there is no XSS surface and no sanitizer is needed. **Do not add `rehype-raw`**; that
omission is the security control.

Styling is one `.md-body` block in `globals.css` built from the existing tokens, not the
Tailwind typography plugin — the app already themes light and dark through
`prefers-color-scheme` and a plugin would fight that.

### The markdown editor is save-agnostic, and gets reused

`MarkdownEditor` takes a controlled `value` and `onChange` and owns no persistence. The
note drawer wraps it in autosave; the node detail forms keep their existing
draft-then-Save semantics. Had autosave been built into the component it could not be
reused at all.

That reuse is the point: **every node already has a `notes` field**, plus long-form prose
(mission, vision, strategy, definition, purpose, description). Once the editor and styles
exist, turning markdown on for those is an optional prop on the shared `TextArea` in
`src/components/detail/fields.tsx` — not new machinery. Short fields stay plain.

### Considered and rejected: node notes as rows in the Notes tab

Since every node has a `notes` field, those could surface as rows in the Notes tab. Tempting,
but the two kinds of row cannot support the same operations:

| Operation                        | A real note      | A node's `notes` field                                                            |
| -------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| Delete                           | Deletes the note | Cannot delete the node — would have to silently mean "clear the text"             |
| Rename title                     | Renames the note | Renames the **project**                                                           |
| Subject / Date / Flag / Contexts | Real columns     | Do not exist; blank and uneditable, or a parallel table to decorate a text column |
| Nest / reorder                   | Meaningful       | Meaningless                                                                       |

That is four capabilities the grid advertises and cannot deliver for half its rows. The
codebase already refuses this trade in `useGridTab.ts` — collapse is deliberately left off
the list tabs because a menu entry that appears to do nothing where you clicked it is worse
than no entry.

The real want underneath is _"I wrote something in a project's notes and now I cannot find
it."_ That is a **search** problem, and it is satisfied properly by a cross-cutting Find
over node names, node notes, and note bodies that navigates to the right record — already
on the roadmap as Phase 1 friction. Merging the lists would be the wrong shape for the
right want.

### Node linking, split so the expensive half can be dropped

The link itself (`notes.nodeId`, a picker, a grid column) is cheap. The reverse surface —
a node's drawer listing its linked notes — needs `NodeDetail` and `loadNodeDetail`
extended and a tab added to all four form files. It is its own task and can be deferred
alone without stranding the rest.

That reverse surface is **read-only**, linking out to `/notes?note=<id>` rather than
embedding an editor. A drawer opened over a drawer is exactly what `ux-principles.md` rules
out.

## Context

- **Visuals:** `screenshots/notes/` — the Notes grid, the Flag dropdown, the View dropdown,
  the Note Item Filter dialog, the Note Information form, and both panel orientations.
- **References:** see `references.md`.
- **Product alignment:** completes the last unbuilt tab of the Phase 1 Achieve MVP in
  `agent-os/product/roadmap.md`. Also feeds the "one-stop shop" motivation behind the
  mission's own-your-data stance — notes stored as plain markdown in our own database.

## Standards Applied

- **`components/ux-principles.md`** — grid + drawer, inline editing for grid-visible
  fields, no modals for routine editing, `Enter`/`F2` bindings, keyboard first. Also the
  source of the "never advertise a capability you cannot deliver" reasoning above.
- **`components/drawer-pattern.md`** — drawer structure, 720px cap, guard the content,
  key on record id, Escape closes. Autosave is a deliberate documented departure from its
  save-and-dirty-prompt flow.
- **`development/testing.md`** — pure logic in `src/lib/notes/**` with adjacent tests; a
  `*.integration.test.ts` for the mutations including the cross-user case; no React
  component tests.
