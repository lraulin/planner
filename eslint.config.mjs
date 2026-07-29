import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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

      // Deliberately NOT enabled: @typescript-eslint/no-unnecessary-condition.
      // `noUncheckedIndexedAccess` is off, so TS types `const [row] = await ...` as
      // always-defined and the rule flags correct runtime guards as dead code. Acting
      // on it would delete real checks. Revisit if noUncheckedIndexedAccess is ever
      // turned on (~149 type errors to work through as of this writing).
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
