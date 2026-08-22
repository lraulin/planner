# References for Register — Track as bill

## Governing specs

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Extends
- **Relevant decisions:** Two-tier model, name vs matchers, exclusivity, propose-never-apply

### `agent-os/specs/2026-08-18-2058-commitments-clarity/`

- **Relationship:** Extends D3 (name it before it commits)
- **Relevant decisions:** Bank strings are matchers; the create surface asks for a name

### `agent-os/specs/2026-08-21-1122-commitments-curation/`

- **Relationship:** Extends
- **Relevant decisions:** `Cadence` as months or days; `detectCadence`; `suggestCommitmentName`; Review BillDraft field set

### `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

- **Relationship:** Extends
- **Relevant decisions:** Declaration is confirmation; a second entry point when detection cannot see the bill

### `agent-os/specs/2026-08-06-1010-command-surface/`

- **Relationship:** Extends
- **Relevant decisions:** One declaration feeds every surface; no hand-written row `MenuItem[]`

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends
- **Relevant decisions:** The Register grid itself; this only adds a command

## Similar implementations

### Commitments Review BillDraft

- **Location:** `src/components/finances/commitments/ReviewList.tsx`
- **Relevance:** Field set, next-charge-follows-cadence-until-touched, `setRecurringBillAction` payload
- **Key patterns:** Name, cadence, amount, next charge; matcher is the bank merchant; unscheduled / category / URL stay off the create surface

### Catalog commands

- **Location:** `src/components/grid/catalogCommands.ts`, `src/components/finances/FinancesView.tsx`
- **Relevance:** Register already uses the three-verb catalog set; extra verbs go on `pageCommands`
- **Key patterns:** `rowMenu: true`, disabled-with-title, rebuild the menu for the row under the pointer

### `upsertRecurringBill`

- **Location:** `src/lib/finances/mutations.ts`
- **Relevance:** The write. Idempotent on name. Matcher exclusivity. No new mutation.

### Matcher index

- **Location:** `src/lib/finances/commitments.ts` (`matcherIndex`)
- **Relevance:** Compact claimed list on Register, including dismissed/cancelled holders
