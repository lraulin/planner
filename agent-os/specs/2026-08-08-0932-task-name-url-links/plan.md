# Task name URL → attachment

**Status: frozen / complete** (2026-08-08)  
Spec folder: `agent-os/specs/2026-08-08-0932-task-name-url-links/`

## Context

When pasting a link into an **attachment** URL field with a blank name, Planner already
fetches the page title (`src/lib/url/pageTitle.ts` + `autofillAttachmentTitleFromUrl`). A
common capture habit is to paste a URL as the **task name** instead — leaving a long ugly
string and no attachment. This feature closes that gap: URLs in a task name become
attachments, and the name is rewritten to the page title(s) when fetch succeeds.

Aligns with the attachments MVP (links only + title fetch) in `agent-os/product/roadmap.md`
as a capture-quality improvement — no roadmap phase change.

## Decisions

| Topic             | Decision                                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope             | **Tasks only** (not projects, goals, result areas)                                                                                                                                                                                             |
| When              | **Every name write** on a task: `createNode` with a non-empty name, and `renameNode` (covers outline blank-create → type name, capture, agent `create_node`)                                                                                   |
| Rewrite           | Replace each URL **substring** with the fetched page title; keep surrounding text. Collapse leftover whitespace. If title fetch fails, leave that URL in the name but still add the attachment                                                 |
| Title source      | Same as attachments: `fetchPageTitle` / `extractPageTitle` (prefer `<title>` over og/twitter)                                                                                                                                                  |
| Multiple URLs     | All `http(s)` URLs in the name become attachments (parallel fetch OK)                                                                                                                                                                          |
| Rename re-run     | Re-process on every rename; only **create** an attachment when that normalized URL is not already on the task. Existing attachments stay                                                                                                       |
| Attachment title  | Set to fetched title when available; blank when fetch fails (same as current attachment autofill). Do not overwrite an existing attachment's title                                                                                             |
| URL detection     | Match `http://` / `https://` spans in free text (and `www.` with https normalization). Do **not** treat bare host tokens mid-sentence as URLs (too many false positives). A name that is _only_ a bare host still works via `normalizeHttpUrl` |
| Network in DB txn | Never hold a transaction open during `fetch`. Create/rename first, then promote URLs outside the write transaction                                                                                                                             |
| Hook location     | Central orchestration in `src/lib` called from `createNode` (task + name) and `renameNode` (after confirming type is task), so capture and agent paths pick it up without each caller remembering                                              |
| Non-tasks         | No-op                                                                                                                                                                                                                                          |
| Out of scope      | Editing attachment rows from the name; stripping URLs from notes; client-side preview before save; rewriting non-task types; bare-domain mid-text heuristics                                                                                   |

## Acceptance criteria

- [x] Creating a task whose name is a single `https://…` URL stores an attachment with that URL and renames the task to the page title when fetch succeeds
- [x] Creating/renaming a task to `"Read https://example.com/a later"` becomes `"Read <title> later"` with one attachment pointing at the URL
- [x] If title fetch fails, the task name still contains the URL and an attachment row exists with that URL (blank title OK)
- [x] Multiple distinct URLs in one name each become an attachment; each is replaced in the name when its title is known
- [x] Renaming again with a URL that is already an attachment does not create a duplicate attachment; new URLs still attach
- [x] Renaming a project/goal/area that contains a URL leaves the name alone and creates no attachment
- [x] Outline flow (blank create → type URL → commit rename) gets the same behavior as capture / `createNode` with name
- [x] Capture (`c` box) and agent `create_node` for tasks with URLs in the name behave the same
- [x] A second user cannot promote URLs onto, rename, or attach to the first user's task
- [x] Pure extraction/rewrite unit tests; integration tests for the mutation path

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                 | Why                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Whole-name bare hosts require a multi-label hostname (dot + letter TLD) or `localhost` | `URL()` accepts single words like `Untitled` as hostnames; without this filter every ordinary task name would become `https://untitled/` |
| 2   | Promote inserts attachments via `db` + `between` rather than `createNodeItem`          | Avoids a `tree` → `detail` → `tree` import cycle while keeping the same append-at-end sort keys                                          |

## Architecture

```
renameNode / createNode (task + name)
        │
        ▼
promoteUrlsFromTaskName(userId, nodeId)     // src/lib/url/taskNameLinks.ts
        │
        ├── load node (must be task, scoped by userId)
        ├── extractHttpUrls(name)             // pure
        ├── list existing attachment URLs for node
        ├── for each new URL: fetchPageTitle + insert attachment
        ├── rewrite name with titles (pure)
        └── update nodes.name directly (no re-entry into renameNode)
```

Avoid `tree` → `detail` → `tree` cycles: promotion lives under `src/lib/url/`, uses `db` +
`between` for append sort keys, and does not import `detail/mutations`.

## As-built code map

| Piece                    | Location                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Extract + rewrite (pure) | `src/lib/url/taskNameLinks.ts` — `extractHttpUrls`, `rewriteNameReplacingUrls`               |
| Promote mutation         | `src/lib/url/taskNameLinks.ts` — `promoteUrlsFromTaskName`                                   |
| Hooks                    | `src/lib/tree/mutations.ts` — after `createNode` (task + non-empty name), after `renameNode` |
| Unit tests               | `src/lib/url/taskNameLinks.test.ts`                                                          |
| Integration tests        | `src/lib/url/taskNameLinks.integration.test.ts`                                              |

## Tasks

- [x] Task 1: Save spec documentation
- [x] Task 2: Pure URL extraction and name rewrite
- [x] Task 3: promoteUrlsFromTaskName + wire create/rename
- [x] Task 4: Verify and freeze (roadmap unchanged)

## Follow-ups (new work — not amendments to this frozen spec)

- Optional: bare-domain mid-sentence heuristics if capture habits need them
- Optional: client optimistic rewrite while fetch is in flight
