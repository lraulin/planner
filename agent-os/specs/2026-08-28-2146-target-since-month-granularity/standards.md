# Standards for `since` month granularity

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`. References, not
copies — recover the exact text with `git show 2920aa7:agent-os/standards/<path>`.

- `agent-os/standards/development/testing.md` — the fix is one comparison in pure `src/lib`
  arithmetic, which is exactly where a wrong answer looks plausible: both the shipped rule and
  the corrected one pass a test suite unless the test uses a `since` in the month it counts.
  The live case is now a named regression in `demand.test.ts`. No database change, so no new
  integration coverage.
- `agent-os/standards/development/dates.md` — `since` stays a `YYYY-MM-DD` calendar day; only
  its comparison changes, to `monthKeyOf(since) > month`. Still no `Date` loop and no
  process-local clock in `cadence.ts`.
- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the model".
  The day filter was a second attempt at the question `remainingOccurrences` got wrong; deleting
  `countWeekdayFromDay` and `monthAnchorDay` with it is the point, not tidying.
- `agent-os/standards/development/commits.md` — the commit body names the root cause: `since`
  was backfilled from `created_at`, which is mid-month for a budget created mid-month.

## Deviations

We deliberately diverge from YNAB's observed delete-and-recreate behaviour. See D2.
