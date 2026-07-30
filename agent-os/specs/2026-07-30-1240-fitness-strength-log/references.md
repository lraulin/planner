# References for Fitness Strength Log

## Product

| Source                                                  | Relevance                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `agent-os/product/roadmap.md` — Phase 3 Fitness tracker | MVP = sets/reps log; modules link into nodes rather than forking hierarchy |
| `agent-os/product/mission.md`                           | Own-your-data; multi-user ready                                            |

## Similar implementations

### Notes (durability pattern)

- **Location:** `src/db/schema.ts` (`notes`), `src/lib/notes/**`, `src/app/notes/**`, `src/components/notes/**`
- **Relevance:** Own domain table, optional link to `nodes` with **on delete set null**, dedicated tab, confirm-before-delete.
- **Key patterns:** Mutations always take `userId`; integration tests prove cross-user isolation; hard delete only with UI confirm.

### Task details extension

- **Location:** `task_details` in schema; `src/lib/detail/{mutations,queries,types}.ts`; `TaskForm.tsx`
- **Relevance:** Optional `exerciseId` on tasks is a 1:1 extension field, allowlisted in `saveNodeDetail`.

### Goal metrics (anti-pattern for history)

- **Location:** `node_items` kinds `metric`, `progress_entry`
- **Relevance:** Dated measurements under a goal — _inspiration_ only. Cascade with parent node; one value per row; wrong for multi-set logs.

### Tree delete semantics

- **Location:** `src/lib/tree/mutations.ts` → `deleteNode`
- **Relevance:** Hard delete cascades children and detail rows. Fitness must not hang history off that cascade.

### Tab shell

- **Location:** `src/components/shell/TabStrip.tsx`
- **Relevance:** Add Fitness as a built tab with `href: "/fitness"`.

## Frozen specs

- `agent-os/specs/2026-07-29-1045-notes-markdown-editor/` — domain module + tab exemplar
- `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` — drawer/forms; task fields
