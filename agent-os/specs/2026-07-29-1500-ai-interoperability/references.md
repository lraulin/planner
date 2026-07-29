# References for AI Interoperability MVP

## Similar Implementations

### Outline domain layer

- **Location:** `src/lib/tree/{mutations,queries,hierarchy,types}.ts`
- **Relevance:** create/rename/state/priority/deadline/focus — primary agent mutations
- **Key patterns:** every mutation takes `userId`; nest rules in `hierarchy.ts`

### Notes

- **Location:** `src/lib/notes/{mutations,queries}.ts`
- **Relevance:** inbox-style capture + optional `nodeId` link
- **Key patterns:** partial update; markdown body preserved as typed

### Schedule

- **Location:** `src/lib/schedule/{mutations,queries,geometry}.ts`
- **Relevance:** week load + appointment CRUD for light schedule tools
- **Key patterns:** range queries; `startOfWeek` normalization

### Weekly planning wizard

- **Location:** `src/lib/planning/{mutations,queries}.ts`, `agent-os/specs/2026-07-28-2144-weekly-planning-wizard/`
- **Relevance:** interactive plan-week skill must write the same tables as the UI
- **Key patterns:** `ensureWeeklyPlan`, `upsertPlanEntry`, `setFocusArea`, plan entries dual-write focus

### Auth seam

- **Location:** `src/lib/auth.ts`
- **Relevance:** agent routes resolve the same dev user until Better Auth

## Prior art outside this repo

### personal-assistant-docs

- **Location:** `/Users/leeraulin/Code/personal-assistant-docs`
- **Files:** `ai/manifest.yaml`, `WARP.md`, `README.md`, `index.md`
- **Relevance:** agent reading order, GTD coaching, “manifest first” pattern — now tools instead of markdown files

### Grok / Claude skills

- **Location:** `.claude/skills/`, `~/.grok/skills/`
- **Relevance:** how to structure `planner-agent` skills (SKILL.md + tool instructions)
