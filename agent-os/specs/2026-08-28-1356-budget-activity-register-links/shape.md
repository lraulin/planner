# Budget Activity → filtered Register — Shaping Notes

**Status: active**

## Scope

Make Budget Activity numbers links that open the Register filtered to the transactions that summed to that figure — Actual's spent-cell drill-down, on this app's Register.

Envelope (Regular, Bills, Savings) Activity cells and the inspector's Activity line. Destination is `/finances/register?view=activity&category=<id>&month=YYYY-MM`. The row set is the same contributing set as `activitySince`, not a generic category+date column filter.

### Out of scope

- Group-header Activity totals and section "spent" captions
- Income received amounts and Ready to Assign terms
- Listing transactions in the inspector (stay on Budget)
- Insights / report chart drill-down
- Schema, migrations, new APIs
- Changing envelope math or funding indicators

## Decisions

- **Envelope Activity + inspector Activity**, not every spent figure. Actual's primary click is the category Spent/Activity cell; group and income are a different gesture.
- **Register page, not an in-place list.** Actual desktop navigates to `/accounts` with category + month. Browser Back returns to Budget.
- **Contributing set, not chips alone.** Ordinary Register filters would include on-budget transfers and split parents that `activitySince` drops. `viewRows` is the hard filter so the list sums to the number.
- **URL-only view.** Same family as `?view=uncategorized` and `?view=tag&tag=`. Do not persist `activity` as the last Register view, or the page bar would reopen a stale envelope filter.
- **Register page still does not await `searchParams`.** Tag already reads extra params on the client so opening a drawer does not reload the ledger.
- **Zero stays a link.** Empty copy names the envelope and month so a $0.00 click is confirmation, not a dead control.
- **Phone: Activity navigates; name still opens the inspector sheet.** Inspector D6 is unchanged except that the Activity control is a real link with a 44px target.

## Context

- **Visuals:** None. Actual Budget desktop is the reference (`onShowActivity` → `/accounts` with `category is {id}` and `date is {month}`).
- **References:** See `references.md`.
- **Product alignment:** Budget/Register fidelity to Actual. Not a named roadmap item; inspector D9 left Register drill-down out of that slice. Note at freeze.

## Standards Applied

See `standards.md`.
