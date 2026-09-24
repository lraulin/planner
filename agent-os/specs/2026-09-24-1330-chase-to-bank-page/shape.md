# Chase to the bank page — Shaping Notes

**Status: frozen / complete** (2026-09-24)

## Scope

Move Chase •••9910 to `bank_page` with the existing cutover script, and stop the cutover from
leaving a permanently unmatched provider account.

### Out of scope

- Inserting the dry run's "missed" rows (`--insert-missed`).
- The Chase payment sign bug.

## Context

- Lee, 2026-09-24: pending Amazon transactions were not showing up, and Accounts showed a red
  ": Match accounts in Settings" line after Capital One's cutover.
- Chase dry run on production: 0 retired, 0 unpaired, since 2026-09-20; the four "missed" rows
  came from a capture taken 2026-09-17.
- Lee's re-link of Capital One in Settings explained why it then listed as `(linked)`.

## Standards Applied

See `standards.md`.
