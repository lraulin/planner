# Standards — Supplies worksheet

**Status: active**

Canonical standards are referenced rather than copied, so this spec does not fork their
instructions. Read these before implementation:

- [`agent-os/standards/development/clean-code.md`](../../standards/development/clean-code.md) —
  the app → components → lib → db direction: all cost arithmetic and Amazon shaping lives in
  `src/lib/finances/supplies/`, `SuppliesView.tsx` never touches the db, `actions.ts` stays
  thin one-liners. Every mutation takes `userId`. **The rule this spec actively invokes** is
  _"when the model is wrong, change the model"_: the source spreadsheet is flat, and D1
  splits it into item + option rather than reproducing the flat shape, because a flat sheet
  cannot hold a price comparison without double-counting it. D3 splits group label from
  envelope link for the same reason — two concepts wearing one field.
- [`agent-os/standards/development/testing.md`](../../standards/development/testing.md) —
  the cost math, pack-size parsing and suggestion shaping are pure logic in `src/lib/**`
  with a `.test.ts` beside each. Anything touching the database gets a
  `*.integration.test.ts` and is not done until a second user has failed to read, change and
  delete the first user's row — here that means both `finance_supply_items` **and**
  `finance_supply_options`, plus a failed attempt to flip `in_use` on someone else's option
  and to attach an option to someone else's item. No React component tests.
  **`npm run test:unit` passing does not mean the database tests ran** — check for the skip
  warning after touching `mutations.ts` or `queries.ts`.
- [`agent-os/standards/development/security.md`](../../standards/development/security.md) —
  ownership proved before every write via a `requireSupplyItem` / `requireSupplyOption`
  probe, and `userId` repeated in the update `where` because an update matching nothing is
  indistinguishable from a successful no-op. The Amazon aggregate is a user-scoped
  `group by`; an unscoped one would leak another user's purchase history into a suggestion
  list.
- [`agent-os/standards/database/migrations.md`](../../standards/database/migrations.md) —
  generated with `npm run db:generate`, never hand-written; the `.sql`, the snapshot and the
  `_journal.json` entry commit together. The direct connection, not the pooler. Note the
  schema's standing reason for **text + `check()` instead of `pgEnum`** for `rate_basis`:
  `ALTER TYPE … ADD VALUE` fails on Neon's transaction-mode pooler.
- [`agent-os/standards/components/data-grid.md`](../../standards/components/data-grid.md) —
  one shared `DataGrid`. Item rows with option children are a hierarchy, and hierarchy must
  survive sort, filter and group. Filtering reaches hidden columns; chips and "Showing N of
  M"; every preference persists through `useGridState`. Do not reach for a grid library.
- [`agent-os/standards/components/ux-principles.md`](../../standards/components/ux-principles.md) —
  inline editing with decimal commit on blur, and **no re-sort while editing** (relevant:
  editing a price changes cost-per-unit, which is a sort key). Modals only for confirmation
  and capture. Icon-only buttons need a title tooltip.
- [`agent-os/standards/components/navigation.md`](../../standards/components/navigation.md) —
  pages live in one registry (`src/lib/navigation/pages.ts`); a page is a URL. **A command
  without a menu is not shipped**, so the Supplies entry needs its Go/palette keywords, and
  the "Add to Supplies" row action on the Orders grid needs a menu home too. Unavailable
  actions are disabled with a specific reason, never hidden.
- [`agent-os/standards/components/modal-pattern.md`](../../standards/components/modal-pattern.md) —
  `SuggestFromAmazonDialog` is built on `ModalShell`: roles, focus, capture-phase Escape, and
  an explicit decision about whether closing discards the in-progress prefill.
- [`agent-os/standards/components/responsive.md`](../../standards/components/responsive.md) —
  `md` is the split; below it the worksheet is a list plus a full-screen sheet rather than a
  grid plus drawer. 44px tap targets on the in-use toggle, and the 16px input rule on the
  money fields. Verify at 390×844 — validation happens on the deployed iPhone.
- [`agent-os/standards/development/dates.md`](../../standards/development/dates.md) —
  `priced_on` and the Amazon order dates are **calendar days**, stored as
  `date(..., { mode: "string" })` `YYYY-MM-DD`. Never run `startOfDay` on them. The
  repurchase-interval arithmetic is a day count, not an instant difference.
- [`agent-os/standards/api/response-format.md`](../../standards/api/response-format.md) —
  server actions return `ActionResult` / `DataActionResult` / `QueryResult` through the
  `run` / `runWithData` / `runQuery` wrappers in `src/app/actionResult.ts`.
- [`agent-os/standards/development/commits.md`](../../standards/development/commits.md) —
  one logical change per commit; imperative subject under 72 characters naming the effect,
  not Conventional Commits; a body explaining why wherever the diff is not self-evident;
  `Spec:` trailer pointing at this folder.

## Deliberately not applied

- **`docs/actual-budget/`** — the Actual Budget reference governs envelope arithmetic. This
  spec computes no budget number and writes no allocation, so its formulas do not apply.
  The one place the two meet is read-only: displaying an envelope's already-computed
  budgeted amount beside a worksheet estimate.
- **`docs/achieve-planner/`** — Achieve had no finance module. There is no fidelity
  obligation here and no behaviour to match.
- **`components/drawer-pattern.md`** — no full-record drawer in this spec; editing is
  inline in the grid, and the only overlay is the suggestion modal. Add this standard if a
  supply-item detail drawer is introduced later.
