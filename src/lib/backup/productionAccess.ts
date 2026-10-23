/**
 * The pure half of `scripts/prod.ts`: what it agrees to run, and how query results print.
 *
 * `branch` and `apply` are permitted in `.claude/settings.json` by command prefix, so
 * whatever they accept is what that permission grants. They accept exactly one repository
 * script under `scripts/`, run through tsx with an argument array and never a shell, so the
 * permission cannot be stretched into an arbitrary command. See `docs/production-access.md`.
 */

const SCRIPT_PATH = /^scripts\/[A-Za-z0-9][\w.-]*\.ts$/u;

export function scriptInvocation(args: readonly string[]): {
  script: string;
  args: string[];
} {
  const [script, ...rest] = args;
  if (!script || !SCRIPT_PATH.test(script) || script.includes("..")) {
    throw new Error(
      "Pass a repository script as the first argument, e.g. scripts/ledger-rta-cutover.ts --user <email>.",
    );
  }
  return { script, args: rest };
}

/** The `npx` argument list for one script, with `.env.local` for everything but the database. */
export function tsxArguments(
  invocation: { script: string; args: readonly string[] },
  envFileExists: boolean,
): string[] {
  return [
    "tsx",
    ...(envFileExists ? ["--env-file=.env.local"] : []),
    invocation.script,
    ...invocation.args,
  ];
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\\/gu, "\\\\").replace(/\t/gu, "\\t").replace(/\n/gu, "\\n");
}

/** Tab-separated, header first, one line per row — psql's unaligned output, NULL shown as ∅. */
export function formatRows(
  fields: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  return [
    fields.join("\t"),
    ...rows.map((row) => fields.map((field) => cell(row[field])).join("\t")),
  ].join("\n");
}
