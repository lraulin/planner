# Standards that applied

**Status: frozen / complete** (2026-08-04)

## `components/data-grid.md`

- **The toolbar-restraint tests** added two cycles ago did the work here, including by saying
  _keep_: `Postponed` passed the "column filter wearing a checkbox?" test because inherited
  dated shelving is not a State value.
- **"A tab declares what it has — it does not assemble buttons."** Four copies of Rename and
  Open were the clearest remaining violation; they are one `rowActions` prop now.
- **"Filter state is always visible and always clearable… `Showing N of M`, where M is the
  count before any narrowing."** The Chooser was breaking the second half: its grid only ever
  saw the limited slice, so the chip bar's denominator was wrong and the toolbar carried a
  second, correct number beside it.

**Amended by this spec:** a **next actions is a switch, not a view** section; two more
toolbar-restraint tests (_does the tab already have one?_ and _is a second control reporting
the same number?_); `lib/tree/nextActions.ts` in the pure-module table.

## `components/ux-principles.md`

- **"Both also appear as toolbar buttons… a gesture nobody can see is not a discoverable
  action."** Why Rename and Open were consolidated rather than deleted — the sweep's job is to
  stop them being written four times, not to remove a required affordance.
- **"Progressive disclosure — show only what's needed now."** Next actions is off by default;
  it is a lens you reach for when choosing work, not a permanent narrowing.
- **"Consistency — the same patterns across every view."** Goals hard-coding `includeDeferred`
  was the inconsistency of the missing kind: the same concept present on two tabs and silently
  fixed on the third.

## `development/testing.md`

- **"Put real logic in `src/lib/**`."** The next-action rule is pure and holds the reasoning;
  the tab wiring is three lines.
- **"A test earns its place if it would fail on a plausible mistake."** Tested: dropping
  summaries along with the extra leaves, keeping a settled leaf so the list never advances,
  letting one branch's next action suppress another's, judging leaf-ness from the wider tree
  instead of the list, and grouping siblings by position so a re-based list yields one row.
- No database code changed, so no `*.integration.test.ts` was in play.

## `docs/achieve-planner/`

Consulted first, per `CLAUDE.md`, rather than inventing semantics from the control's name —
and it changed the design: §8.3 showed Achieve already treats Next Actions as a per-view
**flag**, which is the shape the user was asking for and the shape the Chooser already had.
