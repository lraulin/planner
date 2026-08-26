# Standards for Result Areas without lifecycle state

Applied as of standards commit `f8dab42`. References, not copies — see AGENTS.md.

- `agent-os/standards/database/migrations.md`

  **Why:** The schema contract changes, so generated SQL, snapshot and journal must ship together and the legacy lifecycle values need an inspected backfill.

  Source: agent-os/standards/database/migrations.md

- `agent-os/standards/development/testing.md`

  **Why:** The change touches pure domain logic and database mutations; regression coverage must include real Postgres and a second-user isolation case.

  Source: agent-os/standards/development/testing.md

- `agent-os/standards/development/clean-code.md`

  **Why:** The lifecycle-support rule belongs once in the domain layer, with UI and actions kept as consumers.

  Source: agent-os/standards/development/clean-code.md

- `agent-os/standards/components/data-grid.md`

  **Why:** Outline blanks, filtering, grouping, hierarchy, and shared inline cells all use the one DataGrid contract.

  Source: agent-os/standards/components/data-grid.md

- `agent-os/standards/components/navigation.md`

  **Why:** Unavailable Result Area lifecycle commands remain visible and provide the specific refusal reason on desktop and phone.

  Source: agent-os/standards/components/navigation.md

Deviations: none recorded.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show f8dab42:agent-os/standards/<path>.md`. -->
