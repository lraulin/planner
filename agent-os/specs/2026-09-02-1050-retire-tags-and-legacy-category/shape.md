# Retire Tags and the Legacy Category Column — Shaping Notes

**Status: frozen / complete** (2026-09-02)

## Scope

Remove the Actual-style `#tag` feature from Finances in full, along with the two remaining
pieces of compatibility storage from the same 2026-08-23 taxonomy cutover:
`finance_transactions.category` and `finance_category_cutovers`.

That means: the `finance_tags` table, the `/finances/tags` page and its view, the
`src/lib/finances/tags*` modules, the Register Tags column and pills, the `tag` register view
and `?tag=` deep link, the drawer's tag adder and `#` autocomplete, the Insights Tags filter
dimension, the navigation entry, and the `#tag` tokens sitting in 4,798 transaction Notes.

### Out of scope

- **Group-based reporting.** Groups are the right answer to the reporting gap tags were
  standing in for, but adding a Group dimension to Insights or the Register is its own spec.
  Attaching it to a deletion would mean designing the replacement under the pressure of
  finishing a cleanup.
- **`finance_transactions.source_category`.** The bank's own string, never user-edited, still
  load-bearing for import. Unrelated to the retired taxonomy.
- **Rewriting historical audit rows** that recorded a `category` value.

## Decisions

- **Tags go entirely, not behind a flag.** They were a stopgap for a transitional period that
  is over. There is no user to preserve behavior for: all 22 tags are migration artifacts.
- **The Notes scrub names its 22 targets literally.** A blanket
  `regexp_replace(notes, '(^|[^#])#[^#[:space:]]+', '\1', 'g')` would produce an identical
  result on today's data, and it was offered. The literal list won because the migration file
  becomes the durable record of exactly which strings were deleted from user-authored text —
  the kind of thing you want in six months when someone asks what happened to a note.
- **All three cutover artifacts go in one migration.** Splitting them would leave the cutover
  half-retired, with nothing recording which half.
- **The one real note is protected by construction.** `baby stuff #shopping` → `baby stuff`
  falls out of a token-level replacement; no special case is needed, but it is worth asserting.
- **Audit history is not rewritten.** Old rows recording a `category` change are a record of
  what happened. Only the live column and its writers go.

## Evidence gathered during shaping

Queried against the live local database on 2026-09-02:

| Question                                    | Answer                                                    |
| ------------------------------------------- | --------------------------------------------------------- |
| Tag rows                                    | 22, every description `Migrated from legacy category "…"` |
| User-created tags                           | 0                                                         |
| Transactions with a `#tag` in Notes         | 4,798                                                     |
| Of those, notes with any _other_ text       | **1** — `baby stuff #shopping`                            |
| `finance_transactions.category` non-null    | 1 row                                                     |
| `finance_category_cutovers` code references | 0                                                         |
| `finance_rules` table / rules UI            | Neither exists; `add-tag` survives only as a test fixture |

The tags in Notes are therefore the last surviving copy of the retired taxonomy — and the
copy is not wanted.

## Context

- **Visuals:** None.
- **References:** See `references.md`.
- **Product alignment:** The roadmap's `✅ Actual Categories and Tags shipped 2026-08-23`
  entry (Phase 2) closes with _"Destructive removal of the compatibility storage is a future
  audited delta."_ This spec is that delta. The entry also claimed _"Insights still filters by
  tags without overlapping tag totals"_, which stopped being true here; the entry was amended
  at freeze to name this spec, record the scrub counts as built, and note that group-based
  reporting remains open.

## Standards Applied

See `standards.md` for paths and the pinned commit.
