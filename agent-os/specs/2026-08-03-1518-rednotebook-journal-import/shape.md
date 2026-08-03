# Shaping — RedNotebook import + journal year/month/day tree

**Status: active**

## The ask

Import a personal RedNotebook journal (directory of `YYYY-MM.txt` month files under
`.rednotebook/data/`) into the planner so those day entries show up the same way Day-view
journals do — and put **all** Day journal notes into a durable **Journal → Year → Month →
Day** hierarchy in the Notes tree.

## Why this is one feature

Day journals are already ordinary `notes` rows (`subject = "Journal"`, `noteDate` = the
day). RedNotebook is a calendar-keyed diary. Mapping each RN day into the same journal
note contract means Day view, Notes search/filter, and import share one diary — no second
product surface.

## Decisions

1. **Tree:** `Journal` (root folder) → `YYYY` → `YYYY-MM` → day note (`title=YYYY-MM-DD`,
   `subject=Journal`, `noteDate` set). Folders have empty subject and no `noteDate`.
2. **`saveJournal`** ensures that path and rehomes legacy flat journals when touched.
3. **Import** multi-select `YYYY-MM.txt`; same journal contract.
4. **Re-import:** skip exact body match; append if different and not already contained.
5. **Light markup** RN → markdown (headings, italic, strike, `%` comments, hashtags →
   contexts).
6. **No schema migration.**

## RedNotebook corpus notes

~138 days (2014–2023). Month files are YAML-ish; some fail whole-file strict parse
(`!!python/unicode`, single-quoted multiline). Parser splits on day keys and unquotes
`text` per entry.

## Out of scope

Zip upload, Dropbox server path, RN export, full txt2tags, ACHXML changes.
