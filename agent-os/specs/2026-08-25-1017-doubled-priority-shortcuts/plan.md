# Doubled-letter priority shortcuts

**Status: frozen / complete** (2026-08-25)  
Spec folder: `agent-os/specs/2026-08-25-1017-doubled-priority-shortcuts/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-19-0912-always-ranked-priorities/` — the
  `parsePriority` rank-1 typing shortcuts (`aa`/`ba`/`ca`/`da`). Those stay. This adds
  the doubled-letter aliases `bb`/`cc`/`dd` (and `aa`, already covered).

## Context

Achieve's 1.1.10 shortcut `aa` → A1 exists so you can type rank 1 without reaching for
`1`. We already generalized that to every letter as a trailing `a` (`ba`/`ca`/`da`).
Hitting the **same** key twice is faster still: `bb` → B1, `cc` → C1, `dd` → D1.

The parser currently treats a doubled letter other than `aa` as a typo
(`format.test.ts` asserts `parsePriority("bb")` is undefined). That was an incidental
bound, not a product decision.

## Decisions

- Keep `xa` (x ∈ {a,b,c,d}) → X1. No change to that grammar.
- Add doubled-letter shortcuts: `bb` → B1, `cc` → C1, `dd` → D1. `aa` already maps to A1.
- Mixed two-letter strings that are not trailing-`a` stay typos (`ab`, `cb`, `dc`, …).
  Do not invent a trailing-`b`/`c`/`d` suffix.
- Case and whitespace stay as they are: input is trimmed and uppercased, so `BB` and
  `bb` work.
- One shared parser: `parsePriority` in `src/lib/tree/format.ts`. Every surface already
  uses it (priority cell, Set Priority dialog, detail field, CSV, custom filter). No UI
  copy change unless a string already names the shortcuts (none does).
- Deliberate extra divergence from Achieve: they only documented `aa`. Trailing-`a` on
  B/C/D was already ours; doubled B/C/D is the same class of convenience.

## Acceptance criteria

- [x] `aa`/`ba`/`ca`/`da` still resolve to that letter's rank 1.
- [x] `bb`/`cc`/`dd` (any case, surrounding whitespace) resolve to B1/C1/D1.
- [x] `ab` and other mixed two-letter strings still return `undefined` (typo, not a
      silent assign).
- [x] Typing `bb` into an outline priority cell (or the Set Priority prompt) assigns B1.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change        | Why                                                                       |
| --- | ------------- | ------------------------------------------------------------------------- |
| 1   | None material | Implemented as shaped: doubled-letter rank-1 aliases beside trailing `a`. |

## Task 1: Save Spec Documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Accept doubled letters in `parsePriority`

In `src/lib/tree/format.ts`, after the existing trailing-`A` shortcut (`/^([ABCD])A$/`),
accept a doubled ABCD letter as rank 1:

```
/^([ABCD])\1$/  →  { letter, rank: 1 }
```

`aa` continues to match the trailing-`A` rule first; `bb`/`cc`/`dd` hit the new rule.
Update the comment so it names both grammars.

In `src/lib/tree/format.test.ts`, flip the `bb` assertion from `undefined` to
`{ letter: "B", rank: 1 }`, and pin `cc`/`dd` plus a mixed typo (`ab`) so the two
grammars stay distinct.

Run `npm run test:unit -- src/lib/tree/format.test.ts`.

## Task 3: Verify, freeze spec, commit

- Type `bb` (and spot-check `cc`) into an outline priority cell; confirm it lands as
  B1/C1. `ba` still B1.
- Update plan/shape for any as-built drift; complete **Changes from original plan**.
- Mark files **Status: frozen / complete** (2026-08-25). No roadmap line — this is not
  a listed item.
- Commit and push to `origin/master` with Spec trailer
  `agent-os/specs/2026-08-25-1017-doubled-priority-shortcuts`.
