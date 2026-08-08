# Tomboy note import

**Status: frozen / complete** (2026-08-07)

Spec folder: `agent-os/specs/2026-08-07-1946-tomboy-note-import/`

## Context

Import a Tomboy file-sync repository such as
`Dropbox/AppDocuments/tomboy/0/0/*.note` into Planner Notes. The supplied archive contains
229 XML notes from 2011–2018, including notebook tags, formatted note bodies and ten Tomboy
template records.

## Decisions (current)

| Topic     | Choice                                                                                   |
| --------- | ---------------------------------------------------------------------------------------- |
| Shape     | One flat root Planner note per ordinary Tomboy note                                      |
| Subject   | `Tomboy`, so the whole archive remains filterable                                        |
| Notebooks | `system:notebook:{name}` tags become note contexts                                       |
| Body      | Tomboy inline/list markup becomes Markdown; the duplicated title line is removed         |
| Dates     | Tomboy create/change instants become `createdAt` / `updatedAt`; `noteDate` stays null    |
| Templates | Skip `system:template` notes and report them                                             |
| Re-import | User-scoped Tomboy UUID updates the existing note; unchanged or locally newer notes skip |
| Input     | Multiple `.note` files or a selected sync-repository folder in Settings                  |

## Data model

Add nullable `externalSource` / `externalId` columns to notes plus a partial unique index on
`(userId, externalSource, externalId)`. The pair is import provenance, not display data.
The unique index makes a repeated import idempotent without hiding Tomboy IDs in note text
or contexts, and still permits two users to import the same archive independently.

## Plan

- [x] Parse Tomboy XML and convert supported note markup with pure unit tests
- [x] Map notebook tags, timestamps and templates from a multi-file selection
- [x] Import transactionally with user-scoped create/update/skip behavior
- [x] Generate and apply the Drizzle migration
- [x] Add a standards-compliant multipart API route and Settings panel
- [x] Verify the supplied 229-file archive, cross-user isolation and the rendered app

## Acceptance criteria

- [x] Selecting the supplied Tomboy folder finds all `.note` files recursively
- [x] Ordinary notes retain title, meaningful body formatting, notebooks and original instants
- [x] Tomboy templates are not created as ordinary Planner notes
- [x] Re-import creates no duplicates and updates a changed Tomboy note in place
- [x] One user cannot read, change or delete another user's imported note through the importer
- [x] Malformed or unrelated files warn without discarding valid notes in the same upload
- [x] Import responses follow the repository API envelope and cap returned warnings
- [x] Unit, database integration, lint, typecheck, smoke and production build gates pass

## Changes from original plan

| #   | Change                                                                                 | Why                                                                                             |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | An imported note only overwrites a row when Tomboy's change instant is at least as new | Re-selecting an old archive must not erase a later Planner edit                                 |
| 2   | The browser filters a selected sync folder to `.note` files before upload              | The supplied root also contains an HTML export; uploading those files wastes time and bandwidth |

## Follow-ups (new work — not amendments to this frozen spec)

- Resolve Tomboy internal links to Planner note links if Notes gains stable wiki-link syntax.
- Add Tomboy export only if the legacy application becomes a write target again.
