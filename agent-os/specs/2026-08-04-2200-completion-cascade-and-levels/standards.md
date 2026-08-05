# Standards that applied

**Status: frozen / complete** (2026-08-04)

## `components/ux-principles.md`

- **"Error prevention > error recovery — make dangerous or irreversible actions hard to do by
  accident."** The whole basis of the conditional confirm. The reasoning that matters is
  _which direction_ is irreversible: settling takes open work with it and re-opening does not
  give it back, so only settling asks.
- **"Avoid modals for routine editing… reserve them for destructive confirmations."**
  Completing work is routine and must not be interrupted; completing fourteen things you have
  not done is not. The count is what separates them, which is why the prompt leads with it.
- **"Immediate, clear feedback for every action."** The local cascade exists so the other rows
  change on the same frame rather than after a round trip.

## `components/data-grid.md`

- **"A tab's default arrangement is its default `groupBy`, never a separate toggle."** Already
  written, already followed by Projects; this retired the Outline's `By category` holdout.
- **"Per-tab toggles go in the open `switches` map, declared by the tab."** Following it for
  the new level switches deleted the `outline:filters` scope rather than growing it.
- **"Hierarchy survives every operation"** and the ancestor rule from the previous cycle are
  what make flattening legible as a _separate_ operation rather than a second kind of filter.

**Amended by this spec:** a **filtering is not flattening** section with the two-question
table; a **parent's state is a claim about the work beneath it** section covering the cascade,
its asymmetry, the confirm rule and the cascade-from-the-result rule; a third toolbar test
(_is it an arrangement? then it is `groupBy`_); and two rows in the pure-module table.

## `development/testing.md`

- **"Anything touching the database gets a `*.integration.test.ts`, and it is not done until a
  second user has tried to read, change, and delete the first user's row and failed at every
  step."** `setState` now walks parent and child ids, which is precisely where an unscoped
  query leaks; the isolation test does all three.
- **"Put real logic in `src/lib/**`."** The cascade rule and the flattening walk are pure and
  hold the reasoning; the mutation around them is bookkeeping.
- **"A test earns its place if it would fail on a plausible mistake."** Tested: settling
  overwriting a deliberately cancelled child, failing to descend _through_ a settled node to
  open work below it, re-opening cascading downward, stopping at the first open ancestor
  instead of walking the chain, re-depthing by a constant instead of by surviving ancestry,
  and settling a repeating task's freshly reset subtree.
- **"`npm run test:unit` passing does not mean the database tests ran."** Checked: the full
  `npm test` run reports 16 integration files.

## `components/modal-pattern.md`

`ConfirmDialog` and `ModalShell` unchanged — the cascade prompt is another instance, not a new
surface. It is deliberately **not** `destructive`-styled: completing work is the good outcome,
and painting the confirm red would make the app's happiest path look like a warning.
