# Shaping — RedNotebook import

**Status: active**

## The ask (refined)

Import RedNotebook month files as notes. **Flat** list, not a year/month folder tree.
Subject **Rednotebook**. Day journals stay flat under subject **Journal**.

A year/month/day _view_ of dated notes may come later; it is display, not storage.

## Why not the first tree design

Scaffolding `Journal / 2018 / 2018-06 / day` created many empty folder notes and mixed
import with Day journals. Filtering by subject is enough to browse the archive.

## Decisions

1. Flat root notes; `title` + `noteDate` carry the calendar day
2. `subject = "Rednotebook"` for imports
3. Day `saveJournal` stays flat `subject = "Journal"`
4. Multi-file `YYYY-MM.txt`; exact-body skip on re-import; light markup
