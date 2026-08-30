# Clear priority on settle

**Status: active**  
Spec folder: `agent-os/specs/2026-08-30-1001-clear-priority-on-settle/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-19-0912-always-ranked-priorities/` — dense unique outline ranks, unprioritized as a first-class state, single normalizing write path. The rest of that model stands.
- **Supersedes:** `agent-os/specs/2026-08-19-0912-always-ranked-priorities/` — only the decision that **completed siblings keep their ranks and stay in the pool** (plan.md:73–75). Settled work is now unprioritized; remaining ranks densify immediately.
- **Extends:** `agent-os/specs/2026-07-30-2040-tc-priority/` — separate TC field, global ranking, `letterRankEngine`. The rest stands.
- **Supersedes:** `agent-os/specs/2026-07-30-2040-tc-priority/` — only **compact on the next drag, not on completion** (plan.md:37–38). Completing or cancelling now calls `planClear`.
- **Extends:** `agent-os/specs/2026-07-31-0834-task-recurrence/` (and `2026-08-01-1900-recurrence-ap-parity/`) — reset-in-place, same id, Focus survives, outline Pri survives a cycle.
- **Supersedes:** `agent-os/specs/2026-07-31-0834-task-recurrence/` — only the claim that reset-in-place exists **so TC Priority survives** (plan.md:47–50). Outline Pri and Focus still survive; TC Pri is a judgement about this occurrence and is cleared. Series-end completion is a real finish (already in that code) and clears both.
- **Extends:** `agent-os/specs/2026-08-04-2200-completion-cascade-and-levels/` — hook lives in `applyStateTransition`, so a cascaded settle is the same as a hand-typed one. Cascade still keys off the **resulting** state (a cycling recurring task does not settle its subtree).

## Context

Ranks are dense and unique so “the next action” is one well-defined row. Completed and cancelled items currently keep both outline Pri and TC Pri, so they occupy slots: after finishing A1 the remaining work is A2, A3, … and a new assignment appends past the hole. The always-ranked and TC-priority specs chose that on purpose (“nothing renumbers while you work”). In daily use the hole is the bug.

Outline Pri is how the item sits among siblings in the project. TC Pri is what you decided to do **today**, and tomorrow’s to-do list is a new ranking.

This is a model correction, not a listed roadmap item. Unique ranks exist so sequential numbering tells the truth; leftover settled ranks make it lie.

**Deliberate divergence from Achieve:** Achieve leaves completed ranks alone (and leaves gaps alone). We already diverged on always-ranked unique dense ranks; this is the same divergence taken one step further — settled work is no longer a member of the ranking.

## Decisions

### The matrix

| Event                                                      | Outline Pri                        | TC Pri                            |
| ---------------------------------------------------------- | ---------------------------------- | --------------------------------- |
| Complete a non-recurring item                              | clear + densify remaining siblings | clear + densify remaining TC list |
| Complete a recurring item that **cycles** (reset in place) | **keep**                           | clear + densify remaining TC list |
| Complete a recurring item whose **series ends**            | clear + densify                    | clear + densify                   |
| Cancel (recurring or not)                                  | clear + densify                    | clear + densify                   |
| Reopen / any other state                                   | do not restore; do not touch       | do not restore; do not touch      |

Clearing is `letterRankEngine.planClear`: the settled row becomes unprioritized and the letter it left is rewritten `1..n`. Completing A1 makes A2 become A1 **immediately**. The old “nothing renumbers while you work” rule is gone.

Cancel is a real stop (“I’m done with this habit”), not a cycle. Recurring exception is **only** for a completion that resets in place.

Reopening a completed/cancelled item comes back unprioritized. A cycling recurring task still holds outline Pri (it never left).

Settled items **may** be given a priority again later (typing in the cell still works). Clearing is a settle-time side effect, not a “settled rows cannot be ranked” invariant. Not worth extra UI.

Focus is untouched. Postpone is untouched.

### Where it runs

One hook: `applyStateTransition` in `src/lib/tree/mutations.ts`. Every complete/cancel already goes through it — grid `setState`, drawer `saveNodeDetail`, day-page tick, inbox organizer. Cascade calls it per affected node, so a project complete clears each settled descendant the same way.

**Cannot key off resulting state alone.** A cycling recurring task never lands on `completed`. The hook keys off the **request** (`completed` / `cancelled`) plus whether this write actually cycled.

### What does not change

- Day-list ABC (`daily_items`). Per-day ranks; settled lines already sort to the bottom of that day; they do not occupy tomorrow.
- The ranking engine’s mechanics. Callers invoke `planClear`; do not teach the engine to watch state.
- Sibling-pool membership by state. After this, settled rows are unprioritized, so they occupy no letter. Do not also filter the pool by state.

## Acceptance criteria

- [ ] Completing a non-recurring A1 (outline) unprioritizes it and densifies remaining siblings (old A2 becomes A1) in the same transaction.
- [ ] Completing a non-recurring TC-A1 unprioritizes it and densifies remaining TC ranks the same way.
- [ ] Cancelling does the same for both fields, including a cancelled recurring task.
- [ ] Completing a recurring task that cycles: outline Pri unchanged; TC Pri cleared and remaining TC densified; Focus still set; row still `not_started` / deferred.
- [ ] Completing a recurring task whose series is over: both fields clear (real finish).
- [ ] Reopening a completed/cancelled item does not restore the old ranks.
- [ ] Completing a parent that settles descendants clears those descendants’ ranks the same as a hand-typed settle (recurring descendants still cycle instead of settling).
- [ ] Drawer, day-page, and organizer complete/cancel match the grid — they share `applyStateTransition`.
- [ ] A second user cannot change the first user’s ranks by completing anything.
- [ ] Existing completed/cancelled rows are repaired: both fields cleared, remaining groups densified. Recurring tasks that are Not Started / Deferred are left alone.
- [ ] Day-list ABC, Focus, and postpone behaviour unchanged.

## Out of scope

- Day-list ABC ranks
- Focus flag
- Postpone / defer (not a settle)
- Restoring old ranks on reopen
- Forbidding priority on already-settled rows
- `node_items` / `appointments` / `metrics` priority columns
- Teaching `letterRankEngine` to watch node state

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`. Then **stop**. Implementation is a fresh session against the saved folder.

## Task 2: Pure settle policy

New small module beside the engine, named for the concept (e.g. `src/lib/priority/settle.ts` + `settle.test.ts`):

Given `{ requested: NodeState, cycles: boolean }` return which fields to clear (`outline`, `tc`). Pin the matrix, including series-end (`completed` + `cycles: false`) vs cycle (`completed` + `cycles: true`) vs cancel vs reopen.

This is the only place the product rule lives. Mutations ask it; they do not restate the table.

## Task 3: Clear through `applyStateTransition`

Inside the existing transaction, after the state write (so recurrence has already decided cycle vs finish):

1. Ask the settle policy.
2. If outline: load `siblingPriorityPool`, `planClear` (outline adapter), `applyPriorityAssignments`.
3. If TC: load the user’s TC-ranked nodes, `planTcClear`, persist in **this** transaction (extract an inner `applyTcAssignments(tx, …)` from `setTcPriorities` — do not open a nested `db.transaction`).

Update the `letterRank.ts` header so it no longer says “nothing renumbers merely because an item was completed.” The engine still only densifies a touched letter; **callers** now touch the letter on settle.

Extend existing `setState` / `applyStateTransition` integration tests (and the recurrence ones) rather than a parallel suite. Cross-user case required. Cover drawer and day-page only as far as they already go through this helper — do not duplicate.

## Task 4: Backfill existing settled ranks

Hand-written data migration (no schema change), same shape as `drizzle/0054_typical_steel_serpent.sql`:

1. `UPDATE nodes SET priority_letter/rank = NULL WHERE state IN ('completed','cancelled')` (and the matching TC columns).
2. Densify remaining outline groups: `PARTITION BY user_id, parent_id, priority_letter ORDER BY priority_rank, sort_key`.
3. Densify remaining TC groups: `PARTITION BY user_id, tc_priority_letter ORDER BY tc_priority_rank, sort_key`.

Do **not** touch recurring rows that are not currently completed/cancelled (they are Not Started / Deferred).

Follow `database/migrations`: hand-written SQL is allowed for a backfill `db:generate` cannot express; regenerate the snapshot afterwards so the chain stays intact; commit `.sql` + snapshot + `_journal.json` together. Dry-run against a copy of the real database before applying, as 0054 did.

## Task 5: Verify, freeze spec, update roadmap

- In the running app: complete a ranked one-shot task in the Outline and in the To-do List; confirm remaining ranks close. Complete a recurring task; confirm outline Pri and Focus stay, TC Pri drops, row defers. Cancel a ranked item. Reopen; ranks stay blank.
- After migrate: no completed/cancelled node still holds outline or TC Pri; remaining groups are dense `1..n`.
- `npm run test:unit` and `npm test` with Postgres up (no skip warning). After any `src/app/**` touch, `npm run smoke`.
- Update plan/shape for as-built drift; fill **Changes from original plan**.
- Mark **Status: frozen / complete** (date). Optional one-liner under the always-ranked / recurrence bullets in `roadmap.md` — this is not a listed item.
- Commit and push to `origin/master` with Spec trailer `agent-os/specs/2026-08-30-1001-clear-priority-on-settle`.

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
