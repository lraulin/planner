/**
 * Reducing a bank's description line to the merchant behind it.
 *
 * Feeds do not agree on how to write the same purchase. One Walmart is `WM SUPERCENTER
 * #1981` and the next is `WAL-MART #1981`; Steam is `WL *Steam Purchase` one month and
 * `WL *STEAM PURCHASE` the next; rent arrives as `TURBOTENANT.COM RENT:RAULI`,
 * `TurboTenant RENT:RAULI` and `RENT:RAULIN RENT:RAULI`. Grouping on the raw string turns
 * one merchant into four rows in every report that counts merchants.
 *
 * What this module does is **mechanical only** — strip the wrapping a payment processor or
 * bank feed added, drop the store number, fold case. It deliberately does not know that
 * `WM SUPERCENTER` and `WAL-MART` are one company, because that is a fact about the world
 * rather than about the string, and facts about the world live in `rules.ts` where they can
 * be read and corrected as a list. Keeping the split here is what stops this file from
 * slowly becoming a directory of every merchant in the country.
 */

/**
 * Wrappers the feed itself adds, stripped from the front.
 *
 * Longest first: `Overdraft Transfer to ` has to win over `Overdraft Transfer ` or the
 * remainder keeps a stray preposition. These describe the *movement*, not the merchant —
 * `transfers.ts` reads the raw description precisely because it needs them.
 */
const FEED_PREFIXES = [
  "Preauthorized Withdrawal to ",
  "Preauthorized Deposit from ",
  "Instant transfer received from ",
  "Overdraft Transfer from ",
  "Overdraft Transfer to ",
  "Debit Card Purchase - ",
  "Withdrawal from ",
  "Withdrawal to ",
  "Deposit from ",
  "Deposit to ",
];

/**
 * Payment-processor stamps. PayPal, Square, Toast and the card networks each prepend their
 * own mark, so the same shop reads differently depending on how it was paid.
 */
const PROCESSOR_PREFIXES = [
  "PAYPAL *",
  "PP*",
  "WL *",
  "SQ *",
  "TST* ",
  "ANC*",
  "PHR*",
  "LOY*",
  "IN *",
  "SP ",
];

/** Payroll feeds tack the deposit type onto the employer's name; the employer is the part
 * worth keeping. This is what makes `GA8248 TRUSTEDQA DIRDEP` and `GA8248 TRUSTEDQA
 * PAYROLL` — the same job, after the bank changed its wording — one merchant. */
const PAYROLL_SUFFIXES = [
  " DIRECT DEP",
  " DIRDEP",
  " PAYROLL",
  " TRNSFR DR",
  " TRNSFR CR",
];

/**
 * A trailing store, terminal or order number: `#01522`, ` 0292`, `3021-0001`, ` 28`.
 * Applied repeatedly, so `PANDA EXPRESS # 3006 P` loses `P`, then `# 3006`.
 */
const TRAILING_NUMBER = /\s*#?\s*\d[\d-]*[A-Z]{0,2}$/;

/** A lone letter left behind after a store number was stripped (`# 3006 P`). Only removed
 * when a number precedes it — a real name can end in a single letter. */
const TRAILING_LETTER_AFTER_NUMBER = /(\d)\s+[A-Z]$/;

/** `.COM`, `.NET`, `.AI` and friends, once the string is already uppercase. */
const DOMAIN_SUFFIX = /\.(COM|NET|ORG|AI|IO|CO)\b/g;

/**
 * A per-order reference glued on with an asterisk: `AMZN MKTP US*T04OM6PZ3`.
 *
 * Every Amazon order carries a different one, so without this a single retailer becomes
 * dozens of merchants and never looks recurring. Requiring a digit is what keeps it from
 * eating a real name — `ANTHROPIC* CLAUDE SUB` has no digits and survives.
 */
const TRAILING_ORDER_REF = /\*[A-Z0-9]*\d[A-Z0-9]*$/;

/** A bare asterisk left dangling at the end (`LOWES #00907*`), which would otherwise block
 * the store number behind it from being stripped. */
const TRAILING_ASTERISK = /\*+$/;

function stripOnce(value: string, prefixes: readonly string[]): string {
  for (const prefix of prefixes) {
    if (value.toUpperCase().startsWith(prefix.toUpperCase())) {
      return value.slice(prefix.length);
    }
  }
  return value;
}

/**
 * The merchant identity of a description, or `""` when nothing survives stripping.
 *
 * Uppercase and whitespace-collapsed, so it is safe to compare and to use as a grouping
 * key. Not intended for display on its own — `classify()` prefers a rule's canonical name
 * when one matched.
 */
export function normalizeMerchant(description: string): string {
  // Only the leading whitespace goes now. The prefixes below end in a space, so trimming
  // both ends first would stop `"Withdrawal from "` from matching its own prefix and leave
  // the wrapper behind as if it were the merchant.
  let out = description.replace(/^\s+/, "").replace(/^&\s*/, "");

  out = stripOnce(out, FEED_PREFIXES);
  out = stripOnce(out, PROCESSOR_PREFIXES);
  out = out.toUpperCase().trimEnd();

  for (const suffix of PAYROLL_SUFFIXES) {
    if (out.endsWith(suffix)) {
      out = out.slice(0, -suffix.length);
      break;
    }
  }

  out = out.replace(DOMAIN_SUFFIX, "");

  // Store numbers come off last, after the domain, so `STEAMGAMES.COM 4259522985` loses
  // both. Loop because a single description can carry several trailing fragments.
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out.replace(TRAILING_ORDER_REF, "");
    out = out.replace(TRAILING_ASTERISK, "");
    out = out.replace(TRAILING_LETTER_AFTER_NUMBER, "$1");
    out = out.replace(TRAILING_NUMBER, "");
    out = out.trimEnd();
  }

  return out.replace(/\s+/g, " ").trim();
}
