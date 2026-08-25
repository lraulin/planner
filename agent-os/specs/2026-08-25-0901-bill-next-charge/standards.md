# Standards for Edit a bill's next charge date

**Status: frozen / complete** (2026-08-25)

Include these by reference rather than copying the files. They stay in sync with
`agent-os/standards/`.

@agent-os/standards/components/ux-principles.md
@agent-os/standards/components/data-grid.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/dates.md
@agent-os/standards/development/clean-code.md
@agent-os/standards/development/security.md
@agent-os/standards/development/commits.md

These standards cover:

- **ux-principles** — fields that appear as grid columns edit in place; dates and decimals
  commit on blur, not `change` (native date inputs fire per segment)
- **data-grid** — one shared date cell (`DateKeyCell`); do not invent a second one
- **testing** — real logic in `src/lib/**` with a sibling test; mutations get a
  `*.integration.test.ts` that includes a second user failing to change the first user's row;
  no React component tests
- **dates** — `anchor_date` is already a Postgres `date` stored as `YYYY-MM-DD`; native
  `type="date"` values pass through; no `new Date("YYYY-MM-DD")`
- **clean-code** — `nextChargeWriteError` lives in lib; `actions.ts` stays a one-line
  wrapper; `mutations.ts` does not import `budget/queries.ts`
- **security** — every mutation takes `userId` and scopes by it; the existing
  `upsertBillEnvelope` lookup already does
- **commits** — one logical change per commit, imperative subject, Spec trailer
