# TypeScript and React shape

How a function, a type, and a component should look here. `clean-code.md` says where code
goes and what to name it; this says what it looks like once it is there.

The reader is an agent with a context window and the reviewer is Lee skimming a diff. Every
rule below earns its place by doing one of three things: cutting what must be read to make
a change, making a plausible-but-wrong edit fail to compile or lint, or keeping one style
for the next agent to copy. Where ESLint enforces a rule its id is named and the linter's
own message is not repeated — the rule is the source of truth, this file is the _why_.

## Control flow: flat, guard first

Handle the exceptional case and leave. The main path then reads at one indent.

```ts
// No
function priorityOf(node: Node) {
  if (node.state !== "done") {
    if (node.priorityLetter) {
      return rank(node.priorityLetter);
    } else {
      return DEFAULT_RANK;
    }
  }
  return null;
}

// Yes
function priorityOf(node: Node) {
  if (node.state === "done") return null;
  if (!node.priorityLetter) return DEFAULT_RANK;
  return rank(node.priorityLetter);
}
```

- **No `else` after a branch that returns** (`no-else-return`, `no-lonely-if`). This
  codebase already has none; the rule keeps it that way.
- **At most four nested blocks in a function** (`max-depth: 4`). Nothing here exceeds it.
  Three was measured and rejected: its 33 hits were guard clauses inside two nested loops
  and character-by-character parsers, already flat in the sense that matters. A fifth level
  is a guard clause not yet written or a helper not yet named.
- **Name a compound condition** when it means something in the domain:
  `if (isOverspent(month))`, not `if (m.availableCents < 0 && !m.carryover && …)`. The name
  is what the next agent searches for.
- `for…of` with `continue` is fine and often clearer than a chain. Use `map`/`filter` for a
  transformation, a loop for accumulating several things or for `await`. Do not build an
  object with `reduce` — a loop into a `Map` or a plain object reads in one pass.

## Functions

- **Named functions are `function` declarations** — about 95% of the codebase already is.
  Arrows are for callbacks and inline handlers. Declarations hoist, so a file can read
  top-down: the exported entry point first, its helpers below.
- **No classes, except `Error` subclasses** (`no-restricted-syntax`). Errors need
  `instanceof`; everything else is a function over plain data. A class elsewhere means
  hidden state behind `this`, which an agent changing one method cannot see.
- Small and single-purpose; split by reason to change (`clean-code.md`). If a function
  needs a comment to explain its second half, that half is a function.

## Types

- **`type`, not `interface`** (`consistent-type-definitions`). One spelling, so declaration
  merging can never surprise anyone.
- **Do not silence the compiler.** No `!` in application code (`no-non-null-assertion`;
  tests may use it), and no `as` to turn a value into something it was not checked to be.
  When TypeScript thinks a value can be missing, either it can — handle it — or an
  invariant says it cannot, so throw naming the invariant:

  ```ts
  const group = groups.get(id);
  if (!group) throw new Error(`budget group ${id} missing from its own hierarchy`);
  ```

  Not `groups.get(id)!`, and not `groups.get(id) ?? emptyGroup` — a fallback hides the bug
  the `!` was hiding, and `/fix-bug` forbids both. A raw-SQL string becoming a union is
  narrowed at the query boundary, not cast.

- **Switches over a union handle every member** (`switch-exhaustiveness-check`). Then
  adding a variant to `EnvelopeKind` or `NodeType` breaks the build at every switch that
  must decide what it means, instead of silently falling through. A `default` satisfies
  the rule, so use one only when "everything else alike" is truly the answer. Where a new
  variant could need different handling — above all where the switch gates a check, as
  `touchedRefs` in `src/lib/finances/budget/mutations.ts` gates ownership — list the cases.
- **Discriminated unions for states**, not a bag of optionals:
  `{ ok: true; data: T } | { ok: false; error: string }` (see `ActionResult`).
- **`as const` and `satisfies` for literal tables** — checked against the shape, keeps the
  literal types. `src/components/shell/modules.ts` is the model:

  ```ts
  export const MODULES = [ … ] as const satisfies readonly ModuleEntry[];
  ```

- **Let inference work inside a function**; annotate parameters and exported return types.
  `const name: string = "x"` is noise.
- `any` is already a lint error. `unknown` plus a narrowing check is the alternative.

## React

- **The React Compiler is on** (`reactCompiler` in `next.config.ts`). Do not add
  `useMemo`/`useCallback` for performance in new code; the compiler memoizes. Existing ones
  stay — removing them is churn with no gain. A memo still belongs where identity is part of
  the contract (an effect's dependency that must not change).
- The `react-hooks/*` compiler rules (`purity`, `refs`, `immutability`, `set-state-in-*`)
  are errors. A component that trips one is not compiled, so fix it rather than disable.
- **Static data and pure helpers live outside the component** — they do not belong to a
  render. Column definitions, option lists, label maps: module scope, `as const`.
- A component holding a calculation, a comparison, or a rule with an edge case is holding
  `src/lib` code. Move it down and test it there (`testing.md`).

## File size: a ratchet, not a target

`max-lines` caps a source file at 600 lines of code (blank lines and comments do not count).
Every file read costs the reader its whole length, and a 2,000-line component is read in
full to change one menu item.

The files already over the cap are listed in `eslint.config.mjs`. **That list may only
shrink**: a change may not add to it, and when a listed file drops under the cap its line is
deleted. Split by reason to change — a component's commands, dialogs, and export each change
for different reasons — never by cutting at line 600.

## When refactoring for shape

Refactors driven by readability alone are where agent changes most often make structure
worse (a 2026 study of 403 agent refactoring commits). So: refactor because a lint rule or
a ratchet entry points at the site, keep behaviour identical, one concern per commit, and
let the tests and `npm run smoke` say it still works.
