# References for Card holds from alert emails

- `agent-os/specs/2026-09-23-1316-one-history-source-per-account/` — one posted source per account.
- `agent-os/specs/2026-09-24-1330-chase-to-bank-page/` — superseded for Chase.
- `agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/` — keep-and-flag rule.
- `src/lib/finances/feedHandoverWrite.ts` — `retireRowsOntoOtherSources`.
- `src/lib/finances/feedPairing.ts` — `pairRows`, `resolveLostHold`, tolerances.
- `src/lib/finances/workingPending.ts` — which holds count in the budget.
- `src/lib/finances/historySourceCutover.ts`, `scripts/history-source-cutover.ts` — the cutover.
- `src/app/api/agent/[tool]/route.ts` — Bearer agent-key auth to reuse.
