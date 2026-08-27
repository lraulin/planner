# Standards for Supplies merge keeps product names

Applied as of standards commit `9cfb6f1`. References, not copies.

- `agent-os/standards/development/testing.md` — `preservedOptionBrand` is pure; merge/create isolation stays in the existing integration file.
- `agent-os/standards/development/clean-code.md` — fill rule lives in `src/lib/finances/supplies/merge.ts`, not in the dialog.
- `agent-os/standards/development/commits.md` — `Spec:` trailer to this folder.
- `agent-os/standards/development/security.md` — no new endpoints; merge still probes ownership first.

## Deviations

None. No schema change, so not `database/migrations`.
