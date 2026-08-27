# References for Supplies merge keeps product names

## Governing specs

### `agent-os/specs/2026-08-27-0958-supplies-merge-and-restock/`

- **Relationship:** Extends; supersedes only D1's discarding of source item names.
- **What carries forward:** one survivor, one rate, options reparent, `in_use` unique index, Amazon attach-to-existing, Lasts/Packs/mo.

## Similar implementations

- `src/lib/finances/supplies/merge.ts` — decision helper this delta adds `preservedOptionBrand` to.
- `src/lib/finances/supplies/mutations.ts` — `mergeSupplyItems`, `amazonSupplyPrefill`, `createSupplyItemFromSuggestion`.
- `src/components/finances/supplies/SuggestFromAmazonDialog.tsx` — Add path must pass `brand`.
