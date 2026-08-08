# Shaping — Notes column grouping

**Status: frozen / complete** (2026-08-07)

## The ask

Let Notes group by the columns that form useful repeated buckets: Subject, Contexts, Flag,
Date, Year, Month, Day, and Linked to. Combining up to three fields should create the same
tree-like outline already available for Year → Month → Day.

## Boundaries

- Keep group rows derived in memory; do not create or move notes in the database.
- Keep Title and Preview out of the picker because arbitrary prose is not a useful bucket.
- Treat Contexts as one normalized set. A note appears once, even when it has many contexts.
- Group by the visible Linked to name. A record and contact with the same visible name share
  a bucket because the column itself does not expose a second discriminator.
- Keep the three-level cap and saved-view persistence already owned by the shared grid.

## Ordering

Date, Year, Month, and Day use descending calendar order. Subject, Contexts, Flag, and
Linked to use ascending human-readable order. Missing values always come last and receive a
field-specific header such as `(No Subject)` or `(No Date)`.

## Achieve reference

The local Achieve help says Notes can “change group by columns.” This implementation keeps
that column-driven model while extending the available field inventory with the derived
Year, Month, and Day fields introduced in the earlier frozen calendar-grouping spec.
