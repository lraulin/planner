# Shaping notes

The user had just finished listing bills under the curation spec and asked for six things
in one message: two bugs, then comparable period columns, Review sorted by last charge,
totals on both tables, and a view that compares expected spending to expected income.

The through-line is **comparison**. Amount and Rate cannot be compared or totaled because
they do not share a period. Weekly / monthly / pay period / year can. Income already has
those three (`medianPaycheck`, `normalizedMonthlyIncome`, `median × 26`), so the comparison
is subtraction, not a new model.

Review's default sort was annual cost, which is how you find the expensive unknown. Once
the expensive unknowns have been named, the remaining inbox is "what charged most
recently?" Last charge newest-first is that, and a sortable column covers the rest without
turning Review into a DataGrid (the in-place draft would not survive that).

Group-by landed with the rest of the grid capabilities. Once the bills table could be
sectioned, the footer totals were not enough: a Housing header with a count still made you
add the rows. Group headers now show the same active figures as the footer, for the rows
under that header. Cancelled and paused still do not count.
