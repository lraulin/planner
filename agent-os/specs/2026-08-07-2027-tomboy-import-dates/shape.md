# Shaping — Tomboy import creation dates

**Status: frozen / complete** (2026-08-07)

## The feedback

Imported Tomboy notes appeared to have no dates even though the source format stores them.

## Resolution

Use Tomboy's creation calendar day as Planner's visible Note Date while retaining the full
creation and last-change timestamps in the record metadata. For an archive, visible source
chronology is more useful than leaving the field empty over the narrower semantic distinction
that Note Date can describe the day a manually written note is about.

The calendar day comes from the date portion as written in Tomboy's timestamp, then goes
through Planner's UTC-noon calendar encoding. Converting the timestamp to the importing
machine's local timezone first could move a note to an adjacent day.

## Scope

- New Tomboy imports
- Idempotent backfill when the same folder is selected again
- Preserve the existing newer-Planner-edit-wins rule

## Out of scope

- A standalone migration over imported rows without re-selecting the source archive
- Adding separate Created and Modified columns to the Notes grid
