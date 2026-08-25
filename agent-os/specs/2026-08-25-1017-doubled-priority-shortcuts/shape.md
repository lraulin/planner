# Doubled-letter priority shortcuts — Shaping Notes

**Status: frozen / complete** (2026-08-25)

## Scope

Let `bb`/`cc`/`dd` type as B1/C1/D1 in the same way `aa` already types as A1. Keep the
existing trailing-`a` shortcuts (`aa`/`ba`/`ca`/`da`).

### Out of scope

- New command chords (this is typing into a priority field, not a menu binding)
- A trailing-`b`/`c`/`d` suffix (`ab` stays a typo)
- Hint-bar or dialog copy naming the shortcuts (the Set Priority prompt does not
  mention `aa` today)
- Changing how a typed request is ranked by the engine

## Decisions

- Two grammars, both rank 1: trailing `a`, and a doubled ABCD letter
- One function: `parsePriority`. Every consumer already goes through it
- Mixed two-letter strings remain unrecognised, so a typo reverts rather than
  silently assigning

## Context

- **Visuals:** None
- **References:** `src/lib/tree/format.ts` `parsePriority`; frozen spec
  `2026-08-19-0912-always-ranked-priorities` (acceptance: `aa`/`ba`/`ca`/`da`)
- **Product alignment:** Keyboard convenience on Phase 1 outline priorities — not a
  roadmap item

## Standards Applied

- development/testing — pure parser tests beside `format.ts`
- development/commits — one logical change, Spec trailer
- development/clean-code — one shared implementation
- components/ux-principles — keyboard-first typing on an existing field
