# Clear priority on settle — Shaping Notes

**Status: active**

## Scope

Drop a node out of the auto-sequential ranking when it is completed or cancelled, so leftover ranks stop punching holes in A1..n. Remaining items densify immediately (`planClear`).

The two priority fields answer different questions, so they are not cleared the same way:

- **Outline Pri** is where the item sits among siblings in the project. A one-shot finish or a cancel takes it out of that ranking. A recurring task that cycles still lives in the outline, so it **keeps** outline Pri.
- **TC Pri** is what you decided to do today. Tomorrow’s to-do list is a new ranking, so TC Pri is always cleared on complete/cancel — including a recurring cycle.

### Out of scope

- Day-list ABC (`daily_items`) — per-day ranks; settled lines already sort to the bottom of that day
- Focus flag (recurrence already keeps it via the same id)
- Postpone / defer (not a settle)
- Restoring old ranks on reopen
- Forbidding a later typed priority on an already-settled row
- `node_items` / `appointments` / `metrics` priority columns
- Teaching `letterRankEngine` to watch node state — callers invoke `planClear`

## Decisions

- Completing A1 makes A2 become A1 **immediately**. The old “nothing renumbers while you work” rule (always-ranked plan.md:73–75, TC-priority plan.md:37–38) is superseded.
- Recurring exception is **only** for a completion that resets in place: keep outline Pri, clear TC Pri. Cancel of a recurring task is a real stop and clears both. Series-end completion is a real finish and clears both.
- Reopen does not restore. A cycling recurring row never left outline Pri.
- One hook: `applyStateTransition`. Cannot key off resulting state alone — a cycling recurring task never lands on `completed`.
- Existing completed/cancelled rows are repaired in a data migration (clear + densify). Recurring Not Started / Deferred rows are left alone.
- Clearing is a settle-time side effect, not an invariant that settled rows cannot hold a rank.
- Deliberate further divergence from Achieve, which leaves completed ranks and gaps alone.

## Context

- **Visuals:** None
- **References:** `src/lib/priority/letterRank.ts`, `src/lib/tree/outlinePriority.ts`, `src/lib/chooser/tcPriority.ts`, `src/lib/tree/mutations.ts` (`applyStateTransition`, `setPriority`, `setTcPriorities`). Precedent backfill: `drizzle/0054_typical_steel_serpent.sql`.
- **Product alignment:** Correction to the dense-rank model so sequential numbering tells the truth. Not a listed roadmap item. Recurring TC dropping (instead of surviving) is a deliberate change to the recurrence spec — tomorrow’s to-do list is a new ranking.

## Standards Applied

- `development/testing` — pure matrix in `src/lib`; integration on `applyStateTransition` with a second user
- `development/clean-code` — one policy module, one write path, no copies in drawer/day/organizer
- `development/security` — `userId`-scoped writes; cross-user isolation on the new mutation path
- `development/commits` — one logical change, Spec trailer
- `database/migrations` — hand-written backfill, snapshot regenerated, `.sql` + snapshot + journal together
