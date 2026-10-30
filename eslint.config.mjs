import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// No classes but Error subclasses (development/typescript-react.md): errors need
// `instanceof`; anything else is a function over plain data. Shared by every block that sets
// no-restricted-syntax, because a later block's list replaces an earlier one's.
const NO_CLASSES = {
  selector:
    ":matches(ClassDeclaration, ClassExpression):not([superClass.name=/Error$/])",
  message:
    "No classes except Error subclasses — write functions over plain data (development/typescript-react.md).",
};

// Files already over the 600-line cap when it arrived. This list may only shrink: never add
// a file to it, and delete a line when its file drops under the cap. Split by reason to
// change (a view's commands, dialogs, export), never by cutting at line 600.
const OVERSIZE_FILES = [
  "src/app/(shell)/finances/actions.ts",
  "src/components/detail/ItemList.tsx",
  "src/components/detail/fields.tsx",
  "src/components/finances/FinancesView.tsx",
  "src/components/finances/insights/InsightsView.tsx",
  "src/components/finances/scenarios/ScenariosView.tsx",
  "src/components/fitness/SessionEditor.tsx",
  "src/components/grid/DataGrid.tsx",
  "src/components/grid/cells.tsx",
  "src/components/grid/commonColumns.tsx",
  "src/components/metrics/MetricDrawer.tsx",
  "src/components/notes/NotesGrid.tsx",
  "src/components/organizer/OrganizerView.tsx",
  "src/components/outline/OutlineGrid.tsx",
  "src/components/schedule/AppointmentDrawer.tsx",
  "src/components/schedule/ScheduleView.tsx",
  "src/lib/agent/contracts.ts",
  "src/lib/agent/financeTools.ts",
  "src/lib/agent/tools.ts",
  "src/lib/amazon/apply.ts",
  "src/lib/amazon/snapshot.ts",
  "src/lib/detail/mutations.ts",
  "src/lib/finances/analytics.ts",
  "src/lib/finances/bankSnapshotApply.ts",
  "src/lib/finances/budget/queries.ts",
  "src/lib/finances/import.ts",
  "src/lib/finances/mutations.ts",
  "src/lib/finances/payees/mutations.ts",
  "src/lib/finances/queries.ts",
  "src/lib/finances/scenarios/mutations.ts",
  "src/lib/finances/supplies/mutations.ts",
  "src/lib/find/queries.ts",
  "src/lib/grid/commandDeck.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees the Claude desktop app makes for background sessions. Each is a whole
    // checkout with its own `.next/`, which the `.next/**` above does not reach, so linting
    // from the root walked another session's build output and ran out of heap.
    ".claude/worktrees/**",
  ]),

  // Type-aware linting. Scoped to TS only — the loose .mjs config/scripts aren't in
  // tsconfig's `include`, so the type service has no program for them.
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unhandled rejections are invisible in a Next app: the promise dies and the UI
      // silently keeps whatever state it had. These are the rules that catch that.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // Code shape — development/typescript-react.md has the why for each.
      // One spelling for object types, so declaration merging never surprises anyone.
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      // A switch with no `default` must name every member, so a new variant breaks the
      // build where it needs a decision. A `default` counts: "everything else alike" is a
      // real answer, but list the cases where a new variant could need different handling.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],

      // Deliberately NOT enabled: @typescript-eslint/no-unnecessary-condition.
      // `noUncheckedIndexedAccess` is off, so TS types `const [row] = await ...` as
      // always-defined and the rule flags correct runtime guards as dead code. Acting
      // on it would delete real checks. Revisit if noUncheckedIndexedAccess is ever
      // turned on (~149 type errors to work through as of this writing).
    },
  },

  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", NO_CLASSES],
    },
  },

  // `"use server"` files may only export async functions. A type-only *re-export*
  // (`export type { X }` / `export type { X } from "…"`) looks like it disappears at compile
  // time, and under `tsc` it does — but Turbopack emits a runtime reference to the binding
  // and the server chunk dies with `ReferenceError: X is not defined` the moment it is
  // evaluated. Nothing else catches it: tsc erases the type, the unit tests never import a
  // `"use server"` module, and `next build` compiles these files without evaluating them
  // because every route is `force-dynamic`. It reached production once already.
  //
  // Declaring a type is fine (`export type ActionResult = …`), which is why this matches only
  // an export with specifiers and no declaration. Components that want the shared type should
  // import it from `@/app/actionResult` rather than through an action module.
  {
    files: ["src/app/**/*actions.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        NO_CLASSES,
        {
          selector: 'ExportNamedDeclaration[declaration=null][exportKind="type"]',
          message:
            'No type re-exports from a "use server" file — Turbopack emits a runtime reference and the server chunk throws ReferenceError. Import the type from @/app/actionResult instead.',
        },
      ],
    },
  },

  // Flat control flow (development/typescript-react.md). The codebase already has no else
  // after a return and nothing nested past four blocks; these keep it that way. max-depth 3
  // was measured: its 33 hits were guards inside two nested loops and char-loop parsers,
  // where flattening further buys nothing. `src/` only: one-off scripts under scripts/ are
  // run once against a database and are not where the next agent copies a pattern from.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-else-return": ["error", { allowElseIf: false }],
      "no-lonely-if": "error",
      "max-depth": ["error", 4],
    },
  },

  // File-size ratchet (development/typescript-react.md): every read of a file costs its whole
  // length, so a source file stops at 600 lines of code. Tests and the one Drizzle schema are
  // exempt; OVERSIZE_FILES below lists what was already over when the cap arrived.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "src/db/schema.ts"],
    rules: {
      "max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: OVERSIZE_FILES,
    rules: { "max-lines": "off" },
  },

  // A `!` tells the compiler a value exists without checking it, so the crash lands far from
  // the cause. Application code handles the missing case or throws naming the invariant
  // (development/typescript-react.md). Tests keep `!`: a wrong guess there fails the test.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },

  // In-app links go through `NavLink`, which owns the prefetch switch and the pending-click
  // feedback. A bare `next/link` silently prefetches again (immediate-navigation spec, D6).
  // `/signup` renders outside the shell, so it keeps `next/link`.
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/components/shell/NavLink.tsx", "src/app/signup/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              importNames: ["default"],
              message:
                "Use NavLink from @/components/shell/NavLink: it carries the prefetch switch and the pending-click feedback.",
            },
          ],
        },
      ],
    },
  },

  // Warn-by-default rules worth failing on. With --max-warnings=0 the severity is
  // moot, but the intent should be explicit rather than implied by a CLI flag.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react-hooks/exhaustive-deps": "error",
    },
  },
]);

export default eslintConfig;
