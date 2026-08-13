# References for working-copy views

## Governing specs

### `agent-os/specs/2026-08-05-0230-saved-views/`

- **Relationship:** Extends the catalogue; supersedes live-overlay-per-view and “no update.”
- **Carries forward:** `views:{tabId}`, random ids, `MAX_SAVED_VIEWS`, unique names, allow-list order.

### `agent-os/specs/2026-08-05-1059-views-across-modules/`

- **Relationship:** Extends `useModuleViews` / `viewScopes` / `base`; supersedes per-view live grid scopes as the place adjustments live.

## Similar implementations

### `src/components/grid/useModuleViews.ts`

- Sequence is load-bearing: `useSavedViews` before `useTabView`.
- After this spec: one `useGridState(moduleId)`, `selectView` loads a definition, `saveAs` / `replace` write the catalogue.

### `src/lib/settings/grid.ts` / `views.ts`

- Null-follows-view on the working set is how a loaded definition shows through.
- `clearViewSettings` keeps `view` (origin) and `includeDeferred` (tab-wide).

### Achieve

- `docs/achieve-planner/user-manual.md` §3.3.12 Customize Current View — writes onto the current view with no Save. We diverge: that is the hybrid we are leaving.
