# Supplies — recurring-consumable cost worksheet — Shaping Notes

**Status: frozen / complete** (2026-08-26)

## Scope

A Finances page that prices out things you rebuy on a cycle, so you can answer two
questions the register cannot: **what does this actually cost me per year**, and **am I
buying it from the right place**.

The seed was an existing spreadsheet Lee keeps by hand:

```
Item Type,Brand,Qty Per Item,Vendor,Cost Per Order,Cost Per Unit,Units Per Day,Units Per Month,Cost Biweekly,Cost Per Month,Cost Per Year
Canned Cat Food,Fancy Feast,42,Walmart,$38.97,$0.93,4,122,$51.96,$122.68,$1472.11
Energy Drink,C4 Energy Drink,12,Amazon,$23.66,$1.97,2,61,$55.21,$62.85,$754.15
```

Three things the sheet does badly, which is what the feature exists to fix:

1. **It cannot hold a comparison.** Lee wants to compare vendors, brands and pack sizes for
   the same item, but a flat sheet cannot tell a candidate offer from a real expense, so
   every comparison row inflates the total.
2. **It cannot express items with no countable daily rate.** Toothpaste, Scalpicin. You
   cannot honestly say "0.022 tubes per day"; you can say "a tube lasts about 45 days".
3. **It has to be typed by hand.** The Amazon order history is already in the database with
   per-item ASIN, product name, quantity, unit price and order date — 3,393 retail line
   items back to 2000. It already knows what he rebuys and roughly how often.

### The arithmetic problem found while shaping

The supplied CSV does not reconcile with itself. `Cost Biweekly` is correct in both rows
(`units/day × 14 ÷ qty × cost per order` gives exactly $51.96 and $55.21). `Cost Per Month`
and `Cost Per Year` are not: the sheet computes year as month × 12 and month from something
that no longer matches the row's own units-per-day, so row 2 shows $62.85/mo against a
$55.21 biweekly — barely half of what doubling implies.

This spec therefore **recomputes every period from a single cost-per-day** rather than
reproducing the sheet's columns. Decision D5 in `plan.md`.

### Out of scope

- **Any connection to the budget as a write.** Attributing one Walmart charge across
  several envelopes needs split transactions. Lee's reasoning, verbatim: that "would just
  add extra friction and make it less likely I'll keep up with my system." Nothing here
  writes an envelope, an allocation, or Ready to Assign.
- Matching supply items to `finance_transactions`. Named as future work; it is the same
  thread the roadmap already parks under _itemized receipts_.
- Price history. An option carries one current price plus a `pricedOn` date.
- One-off, non-consumable purchases.
- Automatic re-pricing from later Amazon imports. Suggestions are a prefill, never a sync.

## Decisions

Full statements with rationale are in `plan.md` (D1–D6). The three that shaped the model:

### The model correction: item owns consumption, option owns price

The user's first instinct — and the shape of the source spreadsheet — was one flat row per
item. That was rejected. Splitting into `finance_supply_items` (what you consume, how fast)
and `finance_supply_options` (an offer: brand, vendor, pack size, price) is what makes the
comparison feature possible at all, and it means **switching pack size never means
re-typing how fast you go through the stuff**. Exactly one option per item carries `in_use`
and drives the totals; the rest are inert comparison rows. That "exactly one" is a partial
unique index, not an application rule.

Chosen from an explicit three-way: flat rows, flat rows plus an active flag, or the nested
model. Lee picked the nested model.

### Two rate bases, and the database enforces which column is populated

`units_per_day` (thousandths) or `days_per_unit` (tenths), never both. `days_per_unit`
deliberately means **days one unit lasts**, not days one purchase lasts — that keeps the
rate a property of the item and independent of pack size, which is the same orthogonality
as the decision above. A `CHECK` constraint makes the basis and the populated column agree,
so the invariant cannot rot into a rule enforced only by `mutations.ts`.

### Group label and envelope link are two fields, not one

This one came out of a question Lee declined to answer as posed. Offered "link to an
envelope" versus "free text", he chose neither and wrote:

> I guess this could be a good starting point... But it might help me figure out how to
> reorganize budget... For example, maybe I can get all my pet stuff from Chewy, then the
> amount will be predictable and I can have a separate Pets budget category instead of just
> including it in groceries.

That is not a preference between the two options; it is a use case neither option covers.
He wants to name a group **that is not yet an envelope**, and then see what it currently
costs and where it is currently funded from. So the worksheet carries both: `group_label`
(free text, how you slice the sheet) and `envelope_id` (nullable, which envelope pays for
it today, read-only). The payoff is a group header that reads
**"Pets — est. $1,355/yr · currently funded from Groceries"** — precisely the signal that
Pets should be split out. One field cannot say that.

Matching an envelope by name string was considered and rejected: `CLAUDE.md` names
string-as-join-key specifically, and the whole point here is that the label exists before
the envelope does.

### Smaller calls

- **Cost per unit is derived, never stored.** `$38.97 ÷ 42 = $0.9279` is fractional cents,
  and `src/lib/finances/money.ts` is explicit that a stored rounded value stops a column
  summing correctly.
- **Amazon suggestions prefill and then get out of the way.** The inferred consumption rate
  is `totalUnits ÷ observedSpanDays` — an estimate the user is expected to correct, not a
  number to trust. `subscribe_and_save` is already in the data and is a ready-made "this is
  recurring" flag, so those rows surface even below the repeat threshold.
- **Page name: Supplies** (`/finances/supplies`), chosen over Worksheet / Unit Costs /
  Costs. It describes what is on the page rather than what kind of surface it is, and reads
  correctly beside Dashboard, Budget, Register.
- **All four period columns**, plus group subtotals and a grand total: biweekly (14 days,
  matching payday cadence), monthly, yearly.

## Context

- **Visuals:** None. The CSV above is the source artifact; the option-comparison layout was
  agreed from an ASCII sketch during shaping.
- **References:** See `references.md`.
- **Product alignment:** Net-new roadmap intent. Grepping `agent-os/` for `worksheet`,
  `calculator`, `cost calculator`, `price per` and `unit cost` returns nothing — this is not
  a listed item. It sits nearest the roadmap's _"purpose, not vendor"_ and _itemized
  receipts_ threads under § Financial planning, both of which are about getting below the
  merchant name to what was actually bought. Finances is Phase 3 "Beyond Achieve" territory
  with no Achieve fidelity obligation, so there is no reference implementation to match.

## Standards Applied

See `standards.md` for why each one applies.

- `database/migrations` — two new tables and an index on an existing one.
- `development/clean-code` — the app → components → lib → db direction; the model-correction
  rule is what D1 and D3 are appealing to.
- `development/security` — every mutation takes `userId` and proves ownership first.
- `development/testing` — pure math in `src/lib` with tests beside it; integration tests
  with a second user for everything touching the database.
- `development/commits` — one logical change per commit, `Spec:` trailer to this folder.
- `components/data-grid` — the shared `DataGrid`, hierarchy that survives sort and group.
- `components/navigation` — one registry entry; a command without a menu is not shipped.
- `components/ux-principles` — inline editing, commit on blur, no re-sort mid-edit.
- `components/modal-pattern` — `ModalShell` for the Amazon suggestion dialog.
- `components/responsive` — list plus full-screen sheet below `md`.
