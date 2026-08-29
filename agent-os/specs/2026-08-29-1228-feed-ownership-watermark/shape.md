# Feed ownership: SimpleFIN owns history, the browser snapshot owns the tail — shaping notes

**Status: frozen / complete** (2026-08-29)

## Scope

Give the two card feeds disjoint date ranges so that a transaction can only ever arrive from
one of them, remove the cross-source description matching that ranged over the overlap, and
fix the two defects the overlap exposed: a bill's claim filing charges that are not that bill,
and the Chase capture writing a doubled description as its bank category. Add the Source column
that makes provenance legible in the register.

### Out of scope

- Deleting posted register rows for being absent from a bank page. Considered and dropped:
  once the feeds do not overlap, duplicates are not created, and Lee's own read was "it's not
  an issue if we don't create them in the future."
- Rewriting the cross-source matcher (`liveFeedMatch.ts`) itself. It stops being load-bearing
  for this pair of feeds; it is not being deleted or redesigned.
- Checking-account browser capture, new HTTP/MCP surfaces, audit-driven undo — all still out,
  per the spec this extends.
- Any manual-entry workflow. There is none, by design.

## Root cause

The design assumed two feeds describing the same transaction could be reconciled by comparing
their descriptions. The card sites publish a _cleaned merchant name_ and SimpleFIN publishes
the _raw descriptor_, and neither is derivable from the other — verified against the live
Capital One DOM, not inferred. Any matcher built on that comparison is a heuristic pretending
to be an identity, and it fails silently by creating a second copy of real money.

## Design pressure

- The workflow alternates sources deliberately: SimpleFIN, then scripts to reach the present,
  then SimpleFIN again. That alternation is exactly a watermark, so the model should say so.
- The failure mode has to be **missing**, never **doubled**. A missing row is caught by the
  Dashboard's comparison against the bank's own current balance and by the next sync. A doubled
  row moves budget numbers and is caught by nobody.
- User-owned state must survive a handover, but the matching that carries it must not be load-
  bearing. Making it a convenience — where a miss costs a category and surfaces as
  uncategorized activity — is what keeps a fuzzy comparison out of the money path.
- A claim that means "everything this merchant charges" is wrong for any merchant that is both
  a subscription and a shop. The bill already states its own amount and cadence; the claim
  should use them.
- Completeness must be asserted by the page, not assumed by the script — Capital One through
  its table heading, Chase through its period selector.

## Context

- **Visuals:** None.
- **References:** see `references.md`.
- **Product alignment:** the Finances module's envelope budget follows Actual/YNAB semantics;
  nothing here changes budget math. The failure being fixed was budget numbers moving without
  a corresponding money movement.

## Evidence gathered while shaping (2026-08-29)

- Capital One expanded detail for the pending Pizza Hut charge: merchant name, category, card,
  amount, street address, phone, purchase date, purchaser. No raw descriptor anywhere in the
  DOM; `036874` absent.
- Seven duplicated Capital One transactions in the current cycle; six fixed by `1d6d0ce`'s
  brand-stem matching, the seventh (`Payment from CAPITAL ONE N.A. ...2322` vs
  `CAPITAL ONE MOBILE PYMT`) unfixable by any stem rule.
- Chase reports $84.71 of pending charges; the register showed six pending rows for it.
- `CVS $22.84` on 2026-08-18 is in the stored snapshot evidence verbatim, and in no earlier
  feed — Chase CSV ends 2026-08-10, SimpleFIN's last Chase transaction is 2026-08-14.

## Standards Applied

See `standards.md`.
