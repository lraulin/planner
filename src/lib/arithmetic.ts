/**
 * Evaluate the arithmetic someone types into a number field — `50+25`, `(40+60)/2`,
 * `12.99*2`.
 *
 * Budgeting is adding up receipts, so both YNAB and Actual Budget let any amount field take
 * an expression; this is the same affordance. The structure is ported from Actual's
 * `packages/loot-core/src/shared/arithmetic.ts` (recursive descent, no dependency, no
 * `eval`), minus their `^` rung — no budgeting gesture exponentiates — and with two
 * deliberate differences:
 *
 * - It returns `null` where theirs returns a caller-supplied default, so a caller can tell
 *   "they typed nothing understandable" from "they typed a number".
 * - Trailing garbage is a failure. Actual strips all whitespace before scanning, which makes
 *   `1 2` parse as `12`; here whitespace separates tokens and the parser insists on
 *   consuming the whole string, so `1 2` is a typo rather than a silent twelve.
 *
 * Money callers want {@link parseAmountEntryCents} in `src/lib/finances/money.ts`, which
 * layers the accounting-negative reading of `(1.23)` on top of this. Plain numbers — supply
 * quantities, consumption rates — use this directly.
 */

/** Characters that may appear inside a number token: digits, a decimal point, chrome. */
const NUMBER_CHAR = /[0-9.$,]/;

type Scanner = { readonly text: string; index: number };

/** Thrown internally on any malformed input; never escapes {@link evalArithmetic}. */
class ParseError extends Error {}

function skipSpace(scanner: Scanner): void {
  while (
    scanner.index < scanner.text.length &&
    /\s/.test(scanner.text[scanner.index])
  ) {
    scanner.index++;
  }
}

/** The next non-space character, or `""` at the end of the input. */
function peek(scanner: Scanner): string {
  skipSpace(scanner);
  return scanner.text[scanner.index] ?? "";
}

function eat(scanner: Scanner, char: string): boolean {
  if (peek(scanner) !== char) return false;
  scanner.index++;
  return true;
}

/**
 * A number, a parenthesised sub-expression, or either preceded by unary signs.
 *
 * Currency chrome is tolerated inside the token (`$1,000 + 50` is a natural paste), but the
 * token still ends at whitespace, so the digits of two separate numbers cannot merge.
 */
function parsePrimary(scanner: Scanner): number {
  const char = peek(scanner);

  if (char === "-" || char === "+") {
    scanner.index++;
    const operand = parsePrimary(scanner);
    return char === "-" ? -operand : operand;
  }

  if (char === "(") {
    scanner.index++;
    const inner = parseAdditive(scanner);
    if (!eat(scanner, ")")) throw new ParseError("unbalanced parentheses");
    return inner;
  }

  let token = "";
  while (
    scanner.index < scanner.text.length &&
    NUMBER_CHAR.test(scanner.text[scanner.index])
  ) {
    token += scanner.text[scanner.index];
    scanner.index++;
  }

  const digits = token.replace(/[$,]/g, "");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(digits)) throw new ParseError("expected a number");
  return Number(digits);
}

function parseMultiplicative(scanner: Scanner): number {
  let value = parsePrimary(scanner);
  for (;;) {
    const op = peek(scanner);
    if (op !== "*" && op !== "/") return value;
    scanner.index++;
    const right = parsePrimary(scanner);
    value = op === "*" ? value * right : value / right;
  }
}

function parseAdditive(scanner: Scanner): number {
  let value = parseMultiplicative(scanner);
  for (;;) {
    const op = peek(scanner);
    if (op !== "+" && op !== "-") return value;
    scanner.index++;
    const right = parseMultiplicative(scanner);
    value = op === "+" ? value + right : value - right;
  }
}

/**
 * Evaluate a typed arithmetic expression.
 *
 * Returns `null` — never `NaN`, never `Infinity`, never a throw — for empty input, a syntax
 * error, trailing garbage, or division by zero. A `null` means "do nothing", which is what
 * every caller here does with it: revert the field and write nothing.
 */
export function evalArithmetic(expression: string): number | null {
  const scanner: Scanner = { text: expression, index: 0 };

  let value: number;
  try {
    value = parseAdditive(scanner);
  } catch {
    return null;
  }

  if (peek(scanner) !== "") return null;
  return Number.isFinite(value) ? value : null;
}
