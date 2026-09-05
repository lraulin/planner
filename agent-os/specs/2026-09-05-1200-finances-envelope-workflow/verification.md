# Verification record

Verified locally on 2026-09-05:

- 337 unit test files / 3,973 tests passed.
- 62 integration test files / 1,016 tests passed against Docker Postgres; none skipped.
- Typecheck, zero-warning ESLint, generated agent-documentation check, production build, and all 62 route smoke checks passed.
- Database workflow test reconciles Budget Activity, report contributions, Register index and export for refunds and split leaves; rejects another user’s reads and writes. Bill tests cover duplicate names with distinct histories and owner-scoped edits.
- Pure report tests cover the $100,000 gift and house purchase, Savings spending, nested groups, duplicate names, hidden balances, uncategorized rows, partial-month averages, missing planning estimates, payday boundaries, and inactive/unscheduled bills.
- Retirement migration executed against isolated temporary legacy tables: archives flags/labels/notes before dropping columns, appends labels to notes, and retains the archive after transaction deletion. Both generated migrations applied locally.
- Desktop and 390×844 phone layouts reviewed in light and dark themes for Budget, Bills, Accounts and Insights, including the phone balance/account sheets and cash-flow position chart.
- Disposable local bill/income/account/transaction exercised inline amount edits, sorting during an edit, full bill drawer, Open in Budget, categorization in Register, and return to the same Budget month/envelope. Editing either page affected one bill ID and created no assignment rows. Disposable records removed afterward.
- Accounts refresh completed in place with updated client rows and an Activity receipt. Dashboard URL redirected to Accounts. Report Register links returned to persisted Insights settings.

Screenshots remain local under `.artifacts/planner-shots/` (gitignored). Key evidence: `bills-sort-edit`, `categorized-budget-return`, `income-estimate-edited`, `report-register-final`, `balances-phone-final`, `accounts-sheet-verified`, `cashflow-phone-fixed`, `insights-clean-desktop-dark`.

## Recovery gate

Before releasing migrations 0093 and 0094:

- Forced production backup: `planner-production_2026-09-05T16-25-56Z.dump.gpg`.
- `backup:status` verified the named generation, checksum/manifest and seven-day Neon PITR.
- Dropbox web showed the encrypted dump, manifest and checksum, confirming synchronization off this Mac.
- Neon historical-schema API successfully retrieved the schema at `2026-09-05T16:25:56Z` (HTTP 200). No restore or production mutation was used for this check.
- Prior exclusion metadata remains in `finance_reporting_archive`; historical event labels are also preserved in transaction notes. The archive is recovery storage without an application writer or public read surface.

## Production verification

- Implementation `b134c7005be0c5f4d0cd6c9ced17f3b53e5dd129` pushed to `origin/master`; pre-push unit and Postgres integration gates passed.
- Vercel production deployment `6283579628` completed successfully at `2026-09-05T17:07:14Z`. The pre-release backup was 42 minutes old.
- Read-only production check confirmed Payroll/VA Regular and Gifts/Interest Other, with all four expected amounts NULL.
- All 10 legacy exclusion records were archived. Production had zero nonempty event labels; label preservation is covered by the migration integration test.
- All 62 allocation rows have the same before/after fingerprint, including amounts and metadata.
- Authenticated production browser checks rendered Accounts operations, the Active bills grid with default next-charge/name sorting and collapsed forecasts, Spending/Cost of living with actual Regular income, and Budget’s Regular/Other bands with explicit missing estimates. Saved finance tab order retained its prior relative order after Dashboard removal and Bills insertion.
- Roadmap updated and the spec frozen after these checks. Production: `https://planner-lee-5344.vercel.app`.
