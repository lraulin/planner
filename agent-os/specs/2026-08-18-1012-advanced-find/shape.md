# Advanced Find — Shaping Notes

**Status: frozen / complete** (2026-08-18)

## Scope

One surface that answers _"where did I write that word?"_ across every user-facing record in
the app: outline nodes and their four detail tables, `node_items` sub-records, notes,
appointments, contacts and their contact items, the library (resources, jobs, residences, life
events), metrics, fitness (exercises, sessions, session-exercise notes) and finances
(transactions, accounts, recurring bills, recurring spend).

A `find` module with a `/find` page. A query box, three narrowing controls (Sources, Fields,
Options), and a `DataGrid` of results grouped by type, from which any record can be opened.

### Out of scope

- **Replacing per-grid quick search.** Rung 1 stays exactly as it is, dumb and local.
- **Search-as-you-type.** Explicit Find, for cost reasons — see `plan.md` §6.
- **Find Next / find-within-the-current-view.** Achieve's older, narrower `Find…` is a
  different feature; the grid quick search already covers that want.
- **Replace.** Achieve's dialog is read-only and so is this.
- **A SQL text index** (`tsvector`, `pg_trgm`) or an `ILIKE` prefilter. Recorded as the
  mitigation if Find gets slow, not built now.
- **Saved searches.** The results grid gets saved _views_ for free from `DataGrid`; saving the
  query itself is a separate idea.
- **Searching audit/import tables** — statements, bank sync rows, Amazon order internals beyond
  what the Finances family already covers.
- **Auth tables.** Never.

## Decisions

The full decision list with rationale is in `plan.md`. The five worth restating here because
they are the ones a future agent is most likely to reverse by accident:

1. **The Achieve doc pack does not document this feature.** Two hits across seven files, both
   quoted in `plan.md`. `Quick Fields`, `Text Fields`, `Date Fields`, `Note Fields` and
   `subrecord` appear **zero** times. The three field classes we ship are a reconstruction from
   `visuals/advanced-find-ap.png` and our own schema. Do not "correct" them against the pack.
2. **Regex here does not contradict `data-grid.md`.** That standard's "keep search dumb" rule
   is about rung 1, the grid quick search, and explicitly routes expressiveness to a higher
   rung. Advanced Find is that rung. `2026-08-02-1208-custom-column-filters` deferred
   `Matches Regular Expression` as future work; this is it.
3. **One row per record, not per matching field.** Achieve's screenshot shows the same record
   twice when two fields hit. `Field` names all of them instead.
4. **Achieve's Date Fields checkbox is dropped**, because our dates are typed columns under
   `product/date-model.md`, not free text.
5. **A page, not a modal**, despite Achieve using a modal — `ux-principles.md` reserves modals
   for confirmations and capture, and this is record browsing.

## Context

- **Visuals:** `visuals/advanced-find-ap.png` — the Achieve Planner Advanced Find dialog. It is
  the only surviving description of the feature.
- **References:** see `references.md`.
- **Product alignment:** `roadmap.md:147` lists "find-in-outline" as residual Phase-1 friction.
  This delivers considerably more than that item asks for and supersedes it. `mission.md`'s
  "default when ambiguous: match Achieve" cannot be applied here — see Decision 1.

## Standards Applied

- `components/navigation.md` — one module registry, `go.*` as the exception to the
  menu-completeness rule, the palette as the command-search surface, and the sidebar row this
  spec renames
- `components/data-grid.md` — the results grid, the three-rung disclosure model this sits above,
  chips and `Showing N of M`, preferences persist
- `components/ux-principles.md` — why a page and not a modal; keyboard first on desktop,
  touch-complete on phone
- `components/responsive.md` — the 390×844 checklist, the 16px input rule, 44px targets, the
  compact scope sheet
- `development/clean-code.md` — `app → components → lib → db`; pure logic in `src/lib/find/`;
  no second matcher
- `development/security.md` — `userId` first and scoped in every arm; the four `*_details`
  tables inherit ownership through `nodes`; register the new reader in the cross-user sweep
- `development/testing.md` — pure logic and DB reads tested, no React component tests, the
  cross-user case is the gate
- `product/date-model.md` — what "shelved / past" means for the include-toggle
