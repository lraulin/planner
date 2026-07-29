# Agent tools

## Routing

- One tool per request: **`POST /api/agent/{tool}`** where `{tool}` is a snake_case name
  (`get_context`, `search_nodes`, …).
- Unknown tool → `not_found`.
- Body is the tool’s argument object (JSON). No args → `{}`.

## Design rules

1. **Prefer summary tools** (`get_context`, filtered `search_nodes`) over dumping the full
   outline into the model context.
2. **One write path** — tools call `src/lib/**` mutations/queries only. Do not reimplement
   SQL in the route handler.
3. **Stable names** — tool names are part of the agent contract; rename only with a
   deliberate version or dual-support window.
4. **Ids over paths** — agents work with UUIDs returned by search/create; human labels are
   for display and matching, not as primary keys.
5. **Ask when ambiguous** — instruction-side rule (agent repo): if parent project is unclear,
   ask the user before creating a task under a guess.

## Response data

- Include enough fields for the next step (id, type, name, state, parentId) without
  returning entire detail-form blobs unless the tool is explicitly `get_node` /
  `load_weekly_plan`.

## Testing

- Pure argument parsing / filtering → unit tests beside the module.
- Tool functions that touch the DB → `*.integration.test.ts` with a second-user case.
- Route handlers stay thin wrappers (auth + dispatch); prefer testing the lib entry points.
