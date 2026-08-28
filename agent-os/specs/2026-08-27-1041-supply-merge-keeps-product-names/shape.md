# Supplies merge keeps product names — Shaping Notes

**Status: frozen / complete** (2026-08-27)

## Scope

Keep specific product names on each Supplies offer line after Amazon create and after merge. The generic label is the group Lee types (Energy Drink, Cat Food).

### Out of scope

- Changing how groups work, or prompting for a group name in the merge dialog.
- Renaming the surviving item automatically.
- Inventory / restock columns (already in the parent spec).

## Decisions

See `plan.md`. The screenshot of Canned Cat Food / Fancy Feast Grilled is the desired shape; C4 with a blank brand field is the failure.

## Context

- **Visuals:** compact Supplies screenshot supplied with the ask (C4 blank brand vs Cat Food named lines).
- **Product alignment:** delta on the merge that shipped the same day.
