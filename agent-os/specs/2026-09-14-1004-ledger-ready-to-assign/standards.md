# Standards for Ledger Ready to Assign

Applied as of standards commit `30a9c769`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the model":
  the recorded opening vs recomputed opening, and RTA vs bank pool, are the two-workaround signal.
- `agent-os/standards/development/testing.md` — pure fold, seed, pairing and adjustment logic get
  unit tests; openings, snapshot apply and Reconcile get integration tests with a second user.
- `agent-os/standards/development/security.md` — every new mutation takes `userId` and proves
  ownership (openings, Reconcile).
- `agent-os/standards/database/migrations.md` — generated migrations for the openings column and any
  hold flag; the cutover is data-transforming, so backup + recovery point first.
- `agent-os/standards/development/dates.md` — opening day, statement close and 7-day hold windows
  are calendar days.
- `agent-os/standards/components/navigation.md` — Reconcile is a menu command in the registry.
- `agent-os/standards/components/modal-pattern.md` — Reconcile confirmation on `ModalShell`.
- `agent-os/standards/api/agent-tools.md` — agent finance contracts that expose reconciliation fields.
- `agent-os/standards/development/commits.md` — one logical change per commit, Spec trailer.

## Deviations

None.
