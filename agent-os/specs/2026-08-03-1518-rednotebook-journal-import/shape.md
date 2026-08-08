# Shaping — RedNotebook import

**Status: frozen / complete** (2026-08-07)

## The ask (refined)

Import RedNotebook month files as notes. **Flat** list, not a year/month folder tree.
Subject **Rednotebook**. Day journals stay flat under subject **Journal**.

Notes supplies a Year / Month / Day grouping over the Date field, so the same flat rows can
be browsed as a calendar outline without manufacturing folders in storage.

## Why not the first tree design

Scaffolding `Journal / 2018 / 2018-06 / day` created many empty folder notes and mixed
import with Day journals. Filtering by subject is enough to browse the archive.

## Decisions

1. Flat root notes; `title` + `noteDate` carry the calendar day
2. `subject = "Rednotebook"` for imports
3. Day `saveJournal` stays flat `subject = "Journal"`
4. Multi-file `YYYY-MM.txt`; exact-body skip on re-import; light markup
5. Year, Month, and Day are derived Notes columns: sortable/filterable and available to the
   shared Group by picker
6. Date groups run newest first and create headers only for dates that exist
7. Grouping uses Flat mode; returning to Nested clears grouping so the calendar hierarchy
   never competes with real note parents
8. This deliberately extends Achieve's Notes field inventory: Achieve supported grouping,
   but its documented columns did not include the three derived calendar parts
