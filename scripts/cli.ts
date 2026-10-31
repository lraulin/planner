/**
 * The plumbing every `scripts/*.ts` entry point shares. Pure: importing it opens no
 * database, so `backup.ts` can use it before it knows which database it is talking to.
 */

/** The value after `flag` on the command line, or null when the flag is absent. */
export function argValue(
  flag: string,
  argv: readonly string[] = process.argv,
): string | null {
  const at = argv.indexOf(flag);
  return at === -1 ? null : (argv[at + 1] ?? null);
}

/** Cents as a plain decimal for a receipt line: `-1234` → `-12.34`. */
export function usd(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Run `main` and exit with its code; anything it throws prints and exits 1. */
export function runMain(main: () => Promise<number>): void {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
