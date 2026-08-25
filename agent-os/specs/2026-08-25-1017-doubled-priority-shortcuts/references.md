# References for Doubled-letter priority shortcuts

## Governing specs

### `agent-os/specs/2026-08-19-0912-always-ranked-priorities/`

- **Relationship:** Extends the `parsePriority` rank-1 typing shortcuts
- **Relevant decisions:** A rank is no longer optional, so "top of this letter" is
  worth two keystrokes on every letter. Acceptance: `aa`/`ba`/`ca`/`da` resolve to
  that letter's rank 1. The test that `bb` is a typo was incidental, not named as a
  requirement.

## Similar implementations

### `parsePriority`

- **Location:** `src/lib/tree/format.ts`
- **Relevance:** The only grammar. Trailing `A` after uppercasing is already rank 1.
- **Key patterns:** Trim + uppercase first; unrecognised input returns `undefined`
  so a typo reverts rather than clearing.

### Tests

- **Location:** `src/lib/tree/format.test.ts`
- **Relevance:** Currently asserts `bb` is undefined. Flip that and keep `ab` as
  the mixed-typo pin.

### Callers (do not change)

- `src/components/grid/LetterRankCell.tsx` — outline / TC / Day typed priority
- `src/components/outline/SetPriorityDialog.tsx` — multi-row Set Priority prompt
- `src/components/detail/fields.tsx` — drawer Priority field
- `src/lib/detail/itemCsv.ts`, `src/lib/grid/customFilter.ts` — same parser

## Achieve Planner

- **Location:** `docs/achieve-planner/release-log.txt` (1.1.10)
- **Relevance:** "Use 'aa' as a shortcut for typing priority a1". Only `aa` was
  documented. Trailing-`a` on B/C/D and doubled B/C/D are ours.
