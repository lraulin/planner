# Standards for Doubled-letter priority shortcuts

The following standards apply to this work. Full files live under `agent-os/standards/`;
below is why each matters.

---

## development/testing

**File:** `@agent-os/standards/development/testing.md`

**Why:** The grammar lives in `parsePriority`. Pin the new aliases and the mixed
typo (`ab`) in `format.test.ts` so a later edit that drops the doubled-letter rule
fails loudly.

---

## development/commits

**File:** `@agent-os/standards/development/commits.md`

**Why:** One logical change, effect-named subject, Spec trailer on the implementing
commit.

---

## development/clean-code

**File:** `@agent-os/standards/development/clean-code.md`

**Why:** One shared implementation per concern. Do not add a second parser on a
cell or dialog; `parsePriority` is already the join.

---

## components/ux-principles

**File:** `@agent-os/standards/components/ux-principles.md`

**Why:** Keyboard-first: two same-keystrokes for "top of this letter" is faster than
reaching for `1`. This is a convenience on an existing field, not a new command
that would also need a button.
