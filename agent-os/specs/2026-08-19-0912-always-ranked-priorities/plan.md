# Always-ranked outline priorities

**Status: active**
Spec folder: `agent-os/specs/2026-08-19-0912-always-ranked-priorities/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-07-27-1100-scaffold-and-outline-tab/` — only the
  decision that a node's numeric rank is **optional** (plan.md:23 "ABCD priorities with
  optional numeric rank"; plan.md:100 nullable `priority_rank`). Its drag-resolution
  decisions (`## Change: drag-to-reorder (2026-07-28)`) carry forward unchanged.
- **Supersedes:** `agent-os/specs/2026-08-05-2121-command-deck-and-item-actions/` and
  `agent-os/specs/2026-08-06-1010-command-surface/` — only the `priorityMaintenance`
  capability and its two commands (`Remove priority gaps`, `Reprioritize unique`), which are
  deleted. Every other command-deck decision stands.
- **Extends:** `agent-os/specs/2026-07-30-2040-tc-priority/` — its rule that "ranks are dense
  and automatic … no bare letters here … every letter gets ranks, D included" now governs
  outline priority too, through the same shared engine.
- **Extends:** `agent-os/specs/2026-08-04-0924-grid-control-surface/` — drag-to-reorder as a
  first-class capability, and the drag/sort interaction.
- **Extends:** `agent-os/specs/2026-07-31-1245-day-tab/` (active) — the shared
  `letterRankEngine` extraction. This work adds a third caller's field binding to it and
  widens `planAssign` to accept a block.

## Context

Two things prompted this.

**The reported symptom, resolved.** Dragging a row between its neighbours appeared to have
stopped reprioritizing. There is **no regression**: no commit reverts
`src/lib/tree/outlinePriority.ts` (one commit, never touched since), `useTreeRowDrag.ts`, or
the drag block in `OutlineGrid.tsx`, and a drag between three siblings tied at `A1` was
verified end to end to produce `A1 / A2 / A3`. The cause is that a drop next to an
**unprioritized** row correctly assigns nothing — and in the video project nothing carries a
letter yet. Evidence in `shape.md` Task 2. **No drag fix ships; Task 5 is the remedy.**

**The model change.** Achieve treats the numeric rank as optional (`online-help.md:412-418`),
and we copied that: `nodes.priority_rank` is nullable, bare letters sort last within their
letter, ties are legal, and two repair commands exist to clean up after both. In practice a
bare letter has never carried meaning here, and a tie has only ever meant "undecided". Making
every priority ranked and unique removes a class of fiddling, makes drag placement
unambiguous, and deletes both repair commands.

**This is a deliberate divergence from Achieve.** See "Divergence from Achieve" below.

**The motivating case, diagnosed.** A project of videos to be watched in order. The Task
Chooser showed one video, but the wrong one — the shortest, not the next in sequence.
`applyNextActionFilter` (`src/lib/chooser/views.ts:361-396`) has two modes. With **"Use task
priority order for next project actions"** off it keeps each project's _highest-scoring_
task, and `scoreItem` weights expected effort — which had been filled in accurately from the
video run-times, so the shortest won. With that toggle on it keeps every task tied at the
highest outline priority instead.

The fix is therefore both halves: **unique ranks make the priority path deterministic**
(exactly one task is top; no tie falls through to score), **and that toggle has to be on** for
the chooser to consult priority at all. Ranking alone would leave the shortest-video
behaviour exactly as it was.

## The model

A node's outline priority is either:

- **unprioritized** — `priority_letter` null, `priority_rank` null; or
- **ranked** — an A–D letter plus a rank ≥ 1.

A bare letter is impossible. Within one parent and one letter, ranks are dense `1..n` and
unique.

**Unprioritized stays a first-class state.** Not having decided is not the same as having
decided something is low: auto-assigning A would dilute A, and auto-assigning D would hide
undecided work among Someday/Maybe.

**Completed siblings keep their ranks and stay in the pool.** Completing A1 does not renumber
A2 — nothing renumbers while you work, matching the TC Priority rule. **Deleting** a node
does close its gap, since that is the only way "no gaps" stays true.

## Divergence from Achieve

Achieve's manual defends the optional rank as a two-stage workflow: label broadly first, then
rank only the top five to ten, leaving the rest as bare letters so you are not doing busy work
ordering things that will not get done. It permits ties because two things may be genuinely
equal, and leaves gaps alone to avoid reshuffling a list unpredictably.

We keep the intent and reject the mechanism:

- **The two-stage workflow survives, with less work.** Stage one is still "this is an A" —
  typing `a` lands it at the end of A. Stage two is still "these five are the week's focus" —
  but it is a drag to the top rather than typing numbers. Ranking the top five gets cheaper,
  not more expensive.
- **The bare `A` signal is redundant here.** The manual's unranked `A` means "important, but
  not this week's main focus". In this system that is what **B** is for. The letters follow
  Franklin Covey, which is where Achieve took them: **A = essential**, **B = important but
  does not have to happen ASAP**, **C = optional, do it if there's time**, and **D**
  (Achieve's addition) **= don't do; hide from most views, keep in case I reconsider**. A bare
  `A` is therefore either a `B` that has not been relabelled or a rank nobody got round to —
  neither is information.
- **Ties actively cost us.** Achieve 1.9.6 made every item tied at the top priority a next
  action. A tie expresses "undecided", which the software cannot act on, so the chooser has to
  show everything or fall through to score. Uniqueness is what makes "the next action" a
  single well-defined row.
- **"Unpredictable reshuffling" does not apply.** Inserting at A1 _shifts_ the rest down; it
  never reorders anything already decided. The resulting list is the old list with one row
  moved. `renumber` already emits only rows whose rank actually changed, so the write stays
  minimal.
- **Default rank order = outline order.** Because a bare letter appends, and because the
  backfill orders by `sort_key`, an untouched group's ranks match the order it already reads
  in. That is a meaningful default rather than an arbitrary one, and it is what makes the
  video-series case work.

**Precedent already in the repo.** TC Priority and the Day list already enforce this exact
invariant through `letterRankEngine` (`src/lib/priority/letterRank.ts`), whose header states
both guarantees and whose `assertRankedLetterPriorities` enforces them at the write boundary.
This work extends that engine's invariant to the outline rather than inventing a new rule.

## Decisions

- Existing bare letters are **backfilled in the migration**, in outline order.
- `Remove priority gaps` and `Reprioritize unique` are **deleted**, along with the
  `priorityMaintenance` capability.
- **No dedicated "rank in outline order" command** — it is superfluous once every assignment
  ranks. What ships instead is **set priority on a multi-row selection**, so a thirty-row
  group is one action rather than thirty.
- The Task Chooser gets **one saved per-view setting** covering both drag target and item-name
  colour. When off, chooser drag is unavailable (today's behaviour outside the TC view).
- The quick-capture **Inbox project is created unprioritized**, not bare `D`.
- `node_items`, `appointments` and `metrics` share the priority column shape but have no
  sibling-pool semantics; they are **out of scope**. `daily_items` already enforces the
  invariant.

## Mismatches recorded rather than resolved silently

1. The governing ordering rule — "a bare letter sorts after every ranked item of that letter"
   — lives only in `src/lib/priority/order.ts` and commit `96d67c1`, in no spec. This work
   makes it unreachable for `nodes`. Recorded here as it is retired.
2. `agent-os/specs/2026-08-02-1208-custom-column-filters/` names `encodePriority` as the
   priority comparison, contradicting `order.ts`. The contradiction only bites on bare
   letters, so it dissolves here.

## Acceptance criteria

- [ ] No node can hold a letter without a rank, or a rank without a letter — enforced by a
      CHECK constraint and by a single normalizing write path.
- [ ] Within a parent and letter, ranks are dense `1..n` with no ties, after every write path:
      typing, drag, structural move, delete, import, agent tool.
- [ ] Typing `A` appends to the end of A; `A1` inserts and pushes the rest down; a rank past
      the end clamps; blank unprioritizes and closes the gap.
- [ ] `aa`, `ba`, `ca`, `da` all resolve to that letter's rank 1.
- [ ] A multi-row selection can be given a priority in one action, landing in outline order.
- [ ] Dragging between two ranked siblings renumbers; both slots at a letter boundary are
      reachable.
- [ ] A structural move renumbers the source and destination sibling groups.
- [ ] The migration leaves zero bare letters and zero duplicate ranks in the real database.
- [ ] `Remove priority gaps` and `Reprioritize unique` no longer exist anywhere.
- [ ] The Task Chooser's saved setting switches both drag target and name colour, per view.
- [ ] The video project shows the _next_ unwatched video as its next action.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish
omitted.

| #   | Change                                                                                                                                              | Why                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No drag fix ships.** Task 2 found no regression: drag-to-reprioritize works on desktop and was verified end to end against real data.             | The reported experience is a sibling group where _nothing_ carries a letter, in which a drop correctly assigns nothing. The remedy is Task 5, not a fix.                    |
| 2   | **Bare letters were never the blocker.** A drop onto a bare-letter target already densifies correctly; only a wholly unlettered pool plans nothing. | Corrects an assumption made while shaping. It does not change the model decision — bare letters still go — but it removes "drag is broken by bare letters" as a motivation. |

## Tasks

1. **Save spec documentation** — this folder, Status: active.
2. **Reproduce the drag report** before changing anything; record the actual cause.
3. **One normalizing write path** for node priority (`setPriority`, `saveNodeDetail`).
4. **Structural moves keep the invariant** (`moveNode`, delete).
5. **Set priority on a multi-row selection** (widen `planAssign` to a block; new command).
6. **Drag semantics** under the new model; confirm and test each case.
7. **Migration and backfill**, plus the CHECK constraint and import normalization.
8. **Delete the two repair commands** and the `priorityMaintenance` capability.
9. **Task Chooser saved setting** for drag target and name colour.
10. **Tests** — pure logic and DB mutations, every mutation test with a second user.
11. **Verify, freeze, update roadmap.**

Full task detail is in `shape.md`.

---

**Standing rule while this spec is active:** when a material change is made to requirements,
design, or scope — including from feedback on what was implemented — update the relevant
sections and append a row to **Changes from original plan**. Skip pure implementation
details. Freeze when verified.
