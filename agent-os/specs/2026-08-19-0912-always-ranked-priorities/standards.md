# Standards for Always-ranked outline priorities

**Status: frozen / complete** (2026-08-19)

The standards below apply. Each entry says why it binds _this_ work and quotes the rules that
actually constrain it; the full text lives at the named path.

---

## database/migrations

**Why it applies:** this change adds a CHECK constraint and a hand-written backfill over
`nodes`, which is exactly the case the standard warns about.

> Commit the **`.sql`, the snapshot, and the `_journal.json` entry together**. They are one
> change; a commit with two of the three is the bug described below.

> `db:generate` diffs the _last snapshot_ against `schema.ts`. Drop one and the next generate
> diffs from a stale baseline … **One omission poisons every migration after it.**

> If you genuinely must hand-write SQL that `generate` cannot express (a backfill, a
> data-preserving column swap), still regenerate the snapshot afterwards so the chain stays
> intact.

Statements are separated by `--> statement-breakpoint`. Also from the same standard: use the
direct connection rather than the pooler; production migrates during the build; `db:push` and
`db:seed` are destructive.

**Applied here:** the backfill is hand-written SQL (a window function `db:generate` cannot
express), so the snapshot must be regenerated afterwards. Precedent for a data repair across
these same columns: `drizzle/0028_drop-invalid-priorities.sql`.

---

## development/testing

**Why it applies:** the whole change is pure ranking logic plus database mutations — the two
categories the standard says always get tested — and it rewrites rows in bulk, which is where
a dropped `userId` would do the most damage.

> A test earns its place if it would **fail loudly on a plausible mistake**. If breaking the
> code would not break the test, the test is decoration.

> **Pure logic in `src/lib/**` — always.** … Adjacent `foo.test.ts`.

> **Database mutations and queries — always, as `*.integration.test.ts`.** … a mutation suite
> is not done until it has a case where **a second user tries to read, change, and delete the
> first user's row and fails at every step**.

> **React components — no.**

> **Name the invariant, not the mechanics.** · **Prefer real values over mocks.** … Do not
> mock Drizzle. · **Cover the boundary, not every value.**

> Snapshot tests [are out]. They pass whatever the code does, which is the opposite of a
> tripwire.

**Applied here:** every row of the block-assign table is a boundary case worth one test. The
renumber touches _other users' rows if the `where` is wrong_, so the cross-user case must
cover a second user attempting to renumber the first user's sibling group, not just read it.
`npm run test:unit` passing does not mean the DB tests ran — check for the skip warning.

---

## development/clean-code

**Why it applies:** the central design move is refusing to write a fourth copy of the ranking
rules, and instead making every write path funnel through the one engine.

Binding rules: the `app → components → lib → db` dependency direction (lib never imports app,
components never touch the db, `actions.ts` stays thin); **every mutation takes `userId`**;
**one shared implementation per concern**; small single-purpose lib modules; explicit over
clever; no speculative generality; DRY only for business rules.

**Applied here:** `letterRankEngine` stays the single implementation and gains a third
adapter binding rather than a fork. `PriorityCell`'s verbatim-write behaviour is retired in
favour of the existing `LetterRankCell`. The new selection command is a thin action over a
widened pure planner.

---

## components/data-grid

**Why it applies:** it owns the drag gesture and the persistence of view preferences.

> ## Drag-to-reorder is a feature, not a fallback
>
> Dragging a row is how work gets prioritised here, and dropping renumbers priority letter and
> rank among the destination parent's children (`useTreeRowDrag`, `lib/tree/outlinePriority`).
>
> - Drag is **compatible with a priority sort** and cleared by any other, because any other
>   sort would immediately move the row away from where it was just dropped. Say so on screen
>   rather than silently refusing.
> - Drag is **desktop-only**. Below `md` the equivalent lives in the long-press menu — see
>   `responsive.md`. **Never make drag the only path to an outcome.**

> **Every user-visible grid preference goes into the `grid:{tabId}` scope through the single
> `patch` in `useGridState` — never into component `useState`.**

> **The rule is about the preference, not the hook.** A module that does not use `useGridState`
> still owes it: `useSetting` with a codec of its own, in a scope that already belongs to that
> module.

**Applied here:** "never make drag the only path to an outcome" is the direct justification for
Task 5 — the selection command is the non-drag path to the same ranking outcome, and it is what
makes the below-`md` story work as well. The Task Chooser's new setting persists per view at
`chooser:{viewId}`, the scope that already belongs to that module.

---

## components/ux-principles

**Why it applies:** priority is edited inline in a grid cell.

Binding rules: inline editing for grid-visible fields; **no re-sort while editing**;
date/decimal commit on blur; modals only for confirmations and capture; icon-only buttons need
a title tooltip.

**Applied here:** `LetterRankCell` already commits on Enter/blur, reverts on Escape, and
re-syncs when a drag renumbers underneath it. The accepted trade-off — that dragging under a
non-priority sort changes the priority and then the row returns to sort order — is recorded in
`plan.md` as a deliberate cost, matching Achieve.

---

## components/navigation

**Why it applies:** two commands are deleted and one is added.

> **A command without `menu` is not shipped.** That is the rule that makes the palette and the
> icon row legal. Adding a command to `⌘K` or to a toolbar alone is shipping it for the person
> who already knew it was there.

> ### Unavailable is not absent
>
> A command that cannot run right now — nothing selected, no groups to collapse — is
> `disabled`, not filtered out, with `title` saying why. A command that vanishes teaches you it
> does not exist; a greyed one with "Select a row first" teaches you how to use it.
>
> **The reason has to be the specific one.**

Also binding: plural verbs act on the on-screen selection reduced to roots; right-click covers
rows and blank grid space.

**Applied here:** the new command lives in Organize ▸ Priority — the section the deleted pair
vacates — and is `disabled` with a specific reason when the selection is empty. It is a plural
verb, so it acts on the selection reduced to roots (`selectionMoveRoots`).

---

## components/modal-pattern

**Why it applies:** the selection command needs one field of input.

Binding rules: build every centered dialog on `ModalShell` — roles, focus, capture-phase
Escape, and an explicit choice about whether closing discards or preserves the draft.

---

## components/responsive

**Why it applies:** it is the likely explanation for the reported drag symptom, and it
constrains what the fix may be.

> ### Drag is mouse-shaped
>
> HTML5 drag-and-drop is the reorder mechanism on desktop, and `DataGrid` arms `draggable` on
> `onMouseDown` so a drag does not steal text selection inside cell editors. `onMouseDown` does
> not reliably precede a touch drag, so **drag-to-reorder is disabled below `md`**, deliberately.
>
> Any ranking or reparenting that drag provides on desktop must also exist as an explicit command
> in the long-press menu ("Move to A/B/C/D", "Move up", "Indent"). **Do not add a touch-drag
> polyfill to preserve the gesture; add the command.**

The responsive table (line 27) lists "Drag to reorder" against "An explicit 'Move to…' action".

**Applied here:** if Task 2 concludes the symptom is the `compact` gate in
`DataGrid.dragBindingFor`, that is working as designed, and the answer is the explicit command
— which Task 5 supplies for the ranking half, since setting a priority on a selection is
reachable by touch. Reparenting by touch remains separate work.

---

## development/commits

**Why it applies:** nobody reviews these before they land, so the message is the record.

Binding rules: one logical change per commit; an imperative subject naming the **effect**,
under 72 characters, not Conventional Commits; a body explaining _why_ whenever the diff is
not self-evident; the canonical `Spec` trailer; no AI attribution; the three immutable-message
checks.

**Applied here:** the root cause found in Task 2 goes in a commit body, per the `/fix-bug`
rule that the cause is stated in both the report and the commit.
