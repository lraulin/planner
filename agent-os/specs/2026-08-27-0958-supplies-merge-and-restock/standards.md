# Standards for Supplies — merge items and restock columns

Applied as of standards commit `cf6d34ce661d23605395540b39195296f7f9f868`. References, not copies — see AGENTS.md. `git show cf6d34ce:agent-os/standards/<path>` recovers exactly what applied.

- `agent-os/standards/components/data-grid.md` — Lasts and Packs/mo join the shared Supplies column set; hierarchy (item then offers) must survive sort/filter/group; new columns surface on saved layouts via `known`.
- `agent-os/standards/components/modal-pattern.md` — merge dialog, Amazon Add-to picker, and the Orders New-item-vs-existing picker are `ModalShell`. Closing a preview discards nothing written; confirm is the write.
- `agent-os/standards/components/navigation.md` — Merge selected is a plural Item-menu command acting on the selection reduced to item roots; unavailable is disabled with the reason, never hidden; a command without a menu is not shipped. Compact screens get a pick sheet because they cannot extend a grid selection with modifier keys.
- `agent-os/standards/components/ux-principles.md` — inline edit on the worksheet is unchanged; modals are for confirmation and capture only.
- `agent-os/standards/components/responsive.md` — below `md`, merge/attach pickers are full-screen sheets; 44px tap targets on Add to… / Merge.
- `agent-os/standards/development/testing.md` — restock math is pure in `src/lib/finances/supplies/cost.ts` with tests beside it. Merge, preview, and Amazon-attach are mutations: `*.integration.test.ts`, and not done until a second user has failed to preview, merge, and attach using the first user's ids. No React component tests.
- `agent-os/standards/development/security.md` — every merge/attach/preview takes `userId` and proves ownership of every id before writing or returning another user's names.
- `agent-os/standards/development/clean-code.md` — arithmetic and merge rules live in `src/lib/finances/supplies/`; `actions.ts` stays thin; the view does not touch the db.
- `agent-os/standards/development/commits.md` — one logical change per commit; `Spec:` trailer to this folder.

## Deviations

None from `agent-os/standards/`.

Deliberately not applied:

- `database/migrations` — no new tables or columns. Lasts/Packs/mo are derived; merge rewrites `finance_supply_options.item_id`.
- `components/drawer-pattern.md` — still no supply-item drawer.
- Actual Budget formulas (`docs/actual-budget/`) — this spec still computes no budget number.
- Achieve Planner (`docs/achieve-planner/`) — Achieve had no finance module.
