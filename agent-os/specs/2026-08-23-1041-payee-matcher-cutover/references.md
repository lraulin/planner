# References for Payee matcher cutover

**Status: active**

## Governing specs

- `agent-os/specs/2026-08-23-0748-finance-payees/` — prepared payee rows, aliases,
  transaction ids, claims, rename and merge; its deferred matcher scope is implemented here.
- `agent-os/specs/2026-08-16-1938-commitments/` — two-tier model and the matcher decisions
  superseded here.
- `agent-os/specs/2026-08-18-2058-commitments-clarity/` — commitment read/review surfaces.
- `agent-os/specs/2026-08-21-1122-commitments-curation/` — candidate and suppression flow.
- `agent-os/specs/2026-08-21-1810-register-track-as-bill/` — register claim/refusal flow.
- `agent-os/specs/2026-08-22-2124-actual-schedules/` — validating condition parser,
  recurrence and schedule UX; only the temporary string value is superseded.
- `agent-os/specs/2026-08-22-1948-zero-based-budget/` — formula parity that must not move.

## Actual Budget (`../actual`, MIT © James Long)

| Concern                                         | Reference                                          |
| ----------------------------------------------- | -------------------------------------------------- |
| Payee create and case-insensitive name lookup   | `packages/loot-core/src/server/accounts/payees.ts` |
| Payee resolution on import                      | `packages/loot-core/src/server/accounts/sync.ts`   |
| Merge and mapping behavior                      | `packages/loot-core/src/server/db/index.ts`        |
| Payee rule condition semantics                  | `packages/loot-core/src/server/rules/`             |
| Schedule condition matching                     | `packages/loot-core/src/shared/schedules.ts`       |
| Schedule persistence/discovery                  | `packages/loot-core/src/server/schedules/`         |
| Envelope formulas whose outputs must stay fixed | `packages/loot-core/src/server/budget/envelope.ts` |

`docs/actual-budget/README.md` is the local concern map and remains the entry point.

## In-repo business readers

- `src/lib/finances/commitments.ts` — legacy `matcherIndex` / `resolveMerchant`.
- `src/lib/finances/dashboardQueries.ts` — commitment charges, Available, Dashboard and
  review assembly.
- `src/lib/finances/analytics.ts` — bill claims, rates and detected candidates.
- `src/lib/finances/insightsAnalysis.ts` and `sankeyFlow.ts` — suppression and flow views.
- `src/lib/finances/classify/categorize.ts` and `reclassify.ts` — category precedence and
  payee assignment.
- `src/lib/finances/registerBillDraft.ts` — Register's claim conflict behavior.
- `src/lib/finances/schedules/{conditions,match,queries,mutations,discover}.ts` — schedule
  condition parsing, matching, display and creation.

## In-repo write and UI patterns

- `src/lib/finances/payees/mutations.ts` — prepared claim, rename and merge transactions.
- `src/components/finances/payees/{PayeesView,PayeeDrawer,payeeColumns}.tsx` — host grid and
  drawer/sheet to extend.
- `src/components/finances/budget/MoveMoneyDialog.tsx` — preview/confirmation modal shape.
- `src/components/finances/commitments/`, `review/`, `schedules/` and
  `register/TrackAsBillDialog.tsx` — matcher editors to replace with pickers.
- `src/lib/agent/{tools,financeTools,registry}.ts` — canonical tool definitions, legacy
  exposure and handlers.

## Verification surfaces

- `src/lib/finances/payees/*.integration.test.ts` — user isolation patterns.
- `src/lib/db/crossUserReads.integration.test.ts` — repo-wide read isolation sweep.
- `.agents/skills/run-planner/driver.mjs` — desktop and compact browser verification.
- `scripts/smoke.mjs` — render every static route after touching `src/app/**`.
