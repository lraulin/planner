# Target pane Assign (YNAB chrome, our model)

The supplied screenshot is `.artifacts/ynab-assign-under-target.png`. **Do not
commit that image.** Specs `visuals/*` are gitignored except this file.

YNAB, selected category, right-hand Target:

1. Target heading and summary ("Refill Up to $X Every N Months" + deadline).
2. Circular progress percent.
3. Yellow callout: "Assign **$X.XX** this month to stay on track" and a wide
   Assign button.
4. Needed (with deadline) / Funded / To Go.
5. Edit Target.
6. Snooze switch.

Adapt, do not clone:

- Our summary is `summarize(target)`, not "Refill Up to".
- Progress is `indicator.bar.fill01`, ring or bar.
- Assign is one-row Underfunded from Ready to Assign.
- Needed / Funded / To Go follow our D3 horizon/fill, not YNAB's 6-month
  cadence (we have no such unit).
- Snooze stays our existing button, not a new switch.
- Do not add Auto-Assign to the pane.
- Do not invent a day on a `YYYY-MM` deadline.
