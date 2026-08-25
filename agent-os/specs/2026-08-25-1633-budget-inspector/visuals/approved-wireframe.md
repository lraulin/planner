# YNAB inspector two-pane

The attached screenshot (`ynab-inspector-dining-out.jpg`, gitignored) is the visual target:

- Left: category list with CATEGORY / ASSIGNED / ACTIVITY / AVAILABLE only.
- Right: inspector for the selected category — Available Balance (expandable breakdown),
  Target, actions, Notes.
- Progress bars and `$X needed this month` copy stay on the left list.

Adapt the layout, not the product: our Available breakdown is Actual leftover (carry-in +
assigned + activity), not YNAB's cash-vs-credit split. Do not put Auto-Assign in the pane
as a second copy of the month-bar Assign. Do not re-scrape YNAB. The screenshot was
supplied with the request that opened this spec.
