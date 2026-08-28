# Standards for One Budget export

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`. References, not
copies — `git show 2920aa7:agent-os/standards/<path>` recovers exactly what applied here.

- `agent-os/standards/development/clean-code.md` — the reason D4 adds Markdown to the shared
  format list rather than forking it, and the reason the serializers adapt `section.columns`
  into `ExportColumn` instead of growing a second nesting implementation. Also the dependency
  direction: the whole document model and all four serializers are pure `src/lib/**`;
  `BudgetView` only assembles inputs and calls them.
- `agent-os/standards/development/testing.md` — the document assembly and the four serializers
  are exactly "pure logic where a wrong answer looks plausible", and they are pure, so they get
  `*.test.ts` files beside them and no component tests. Nothing here touches the database, so
  no integration test is owed. Tests that would fail on a plausible mistake: a hidden column
  leaking into the wrong section, forecast items flattening instead of nesting, a section title
  containing a comma breaking the CSV stack.
- `agent-os/standards/components/navigation.md` — a command without a menu is not shipped;
  export stays on `File`, menu-only, on every surface (desktop pulldown, Commands panel, ⌘K,
  phone `⋯`). Deleting the scoped rows is deleting commands, so the catalog must still be
  complete afterwards.
- `agent-os/standards/components/data-grid.md` — the unavailable-or-duplicated toolbar rule is
  what keeps export off the icon row, and the reason the three grids opt out via a prop rather
  than each host re-registering.
- `agent-os/standards/development/commits.md` — one logical change per commit; the commit that
  deletes `gridScopes.ts` says in its body that the scoping existed only because three grids
  shared one File menu, and that the fix removed the sharing rather than the collision.

## Deviations

- **`2026-08-14-1021` D3 said the CSV is flat with no group headers, one header row.** That
  still holds _within a section_; the Budget CSV is several such tables stacked. Named here
  because a reader of the frozen spec would otherwise see a contradiction.
- **`2026-08-14-1021` D6 said an empty structured export is `[]`.** The Budget document is
  never empty — it always has a title and a headline — so it is an object with an empty or
  short `sections` array, not `[]`. Per-grid export is unchanged.
