/**
 * Reading a PayPal monthly statement, which is not an account statement at all.
 *
 * PayPal here is a **payment rail, not a balance**. Every purchase appears twice: the payment
 * itself, and immediately after it the funding leg that covers it — a `General Credit Card
 * Deposit` when a card paid, or the bank named inline on the payment when checking did. The
 * two net to zero, because no balance is ever carried. That is why this module returns
 * *entries to match against rows we already have* rather than transactions to insert:
 * importing these would be a second helping of spending that is already on the card.
 *
 * What the statement uniquely knows is **who was paid**. The bank feed says
 * `Withdrawal from PAYPAL to LEE RAULIN INST XFER`; only PayPal says that was Pluralsight.
 * Same for money arriving: the bank says `Deposit from PAYPAL from LEE RAULIN TRANSFER`,
 * PayPal says `General Payment: Dennis Raulin`.
 *
 * Two things about the extracted text will silently double or corrupt the output:
 *
 * 1. **Each PDF contains two statements.** `PAYPAL ACCOUNT` is followed by `PAYPAL BALANCE
 *    ACCOUNT`, and every transaction is listed in *both*. Parsing the whole file reports
 *    each payment twice. Everything after that marker is dropped.
 * 2. **Dates wrap mid-token.** The extractor emits `03/04/202` then a newline then `5
 *    PreApproved Payment…`. A record regex anchored on a whole date silently skips every
 *    wrapped one — and which records wrap depends on where the page broke, so a fixture that
 *    happens not to wrap proves nothing.
 */

/** Where the second, duplicate statement begins. Everything from here is a repeat. */
const BALANCE_SECTION = "PAYPAL BALANCE ACCOUNT";

/** `03/04/202` + newline + `5 …`. The break lands inside the year. */
const WRAPPED_DATE = /(\d{2}\/\d{2}\/\d{1,3})\n(\d{1,3})(?=\s)/g;

/** A record begins at a date on its own line boundary. */
const RECORD_START = /^(\d{2})\/(\d{2})\/(\d{4})[ \t]*(.*)$/gm;

/** The closing column line: `USD -13.78 0.00 -13.78`. */
const AMOUNT_LINE =
  /^([A-Z]{3})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})$/m;

/** `9.56 USD X 0.7397 (Exchange Rate) 7.07` — the USD side of a foreign charge. */
const FX_USD = /^([\d,]+\.\d{2})\s+USD\s+X\s+[\d.]+\s+\(Exchange Rate\)/m;

/** `CAPITAL ONE N.A. - Checking x-2322` — the bank that funded this payment. */
const FUNDING_KEY = /x-(\d{4})/;

/** A bare restatement of the amount under the funding line: `237.44 USD`. */
const BARE_AMOUNT = /^[\d,]+\.\d{2}\s+[A-Z]{3}$/;

/**
 * Lines that end the counterparty.
 *
 * Stopping at the first of these, rather than filtering the whole document, is what keeps
 * page furniture out of merchant names without hardcoding the account holder's name: the
 * furniture block always opens with `ACCOUNT STATEMENTS`, and the name sits inside it.
 */
const COUNTERPARTY_STOP: readonly RegExp[] = [
  /^ID:/,
  /^Ref ID:/,
  /^[A-Z]{3}\s+-?[\d,]+\.\d{2}/,
  /\(Exchange Rate\)/,
  /x-\d{4}/,
  /^PayPal Balance\b/,
  /^ACCOUNT STATEMENTS$/,
  /^ACCOUNT ACTIVITY$/,
  /^PAYPAL ACCOUNT$/,
  /^Page \d+$/,
  /^DATE DESCRIPTION/,
  /^Statement Period/,
  /^\*/,
  /^[A-Z]{3}$/,
  BARE_AMOUNT,
];

export type PaypalEntryKind =
  /** Money leaving to a merchant. The economic event. */
  | "payment"
  /** Money arriving from a person or business. */
  | "receipt"
  /** A card covering a payment. Pairs with the card's own `PAYPAL *X` charge. */
  | "card_funding"
  /** Moving a balance out to a bank. */
  | "withdrawal"
  /** Anything else the statement lists. Kept so totals can be checked, not matched. */
  | "other";

export type PaypalEntry = {
  /** PayPal's own transaction id. Stable across re-downloads, so it is the dedup key. */
  externalId: string;
  /** The payment this one funds, when it is a funding leg. */
  refId: string | null;
  /** `YYYY-MM-DD`. */
  date: string;
  kind: PaypalEntryKind;
  /** Who PayPal says was paid, or who paid. Empty when the statement does not name one. */
  counterparty: string;
  /**
   * Signed, in **USD cents**, module sign — negative leaving.
   *
   * For a foreign charge this is the USD figure off the exchange-rate line, not the foreign
   * amount in the total column: the bank was debited in dollars, and matching on 7.07 GBP
   * would never find the 9.56 USD row it belongs to.
   */
  amountCents: number;
  /** Last four of the bank account named inline as the funding source. */
  fundingKey: string | null;
};

/** Cheap enough to run on every uploaded file, specific enough not to claim someone else's. */
export function looksLikePaypalStatement(text: string): boolean {
  return (
    text.includes("PAYPAL ACCOUNT") &&
    text.includes("ACCOUNT ACTIVITY") &&
    /Statement Period/.test(text)
  );
}

function centsOf(figure: string): number {
  return Math.round(Number(figure.replace(/,/g, "")) * 100);
}

function kindOf(header: string): PaypalEntryKind {
  if (/^General Credit Card Deposit/.test(header)) return "card_funding";
  if (/^User Initiated Withdrawal/.test(header)) return "withdrawal";
  if (
    /Payment(?: Bill User Payment)?\s*:/.test(header) ||
    /Payment Sent/.test(header)
  ) {
    // `General Payment: Dennis Raulin` is money *arriving* — PayPal words an inbound
    // person-to-person payment the same way it words an outbound one, so the sign on the
    // amount line is the only thing that tells them apart. Resolved by the caller.
    return "payment";
  }
  if (/^Express Checkout Payment/.test(header)) return "payment";
  return "other";
}

/**
 * Every entry in the PayPal (not PayPal Balance) statement, in document order.
 *
 * Returns `[]` for a file that is not a PayPal statement rather than throwing: the importer
 * tries each parser in turn against every uploaded file.
 */
export function parsePaypalStatement(text: string): PaypalEntry[] {
  if (!looksLikePaypalStatement(text)) return [];

  const boundary = text.indexOf(BALANCE_SECTION);
  const section = (boundary === -1 ? text : text.slice(0, boundary)).replace(
    WRAPPED_DATE,
    "$1$2",
  );

  // Record boundaries first, so each record's body is "up to the next date".
  const starts: {
    index: number;
    month: string;
    day: string;
    year: string;
    head: string;
  }[] = [];
  for (const match of section.matchAll(RECORD_START)) {
    starts.push({
      index: match.index,
      month: match[1],
      day: match[2],
      year: match[3],
      head: match[4],
    });
  }

  const entries: PaypalEntry[] = [];
  starts.forEach((start, position) => {
    const body = section.slice(
      start.index,
      starts[position + 1]?.index ?? section.length,
    );
    const id = /^ID:\s*(\S+)$/m.exec(body);
    const amount = AMOUNT_LINE.exec(body);
    // No id or no amount column means this is not a transaction record — a page header that
    // happens to open with a date, most often.
    if (!id || !amount) return;

    const currency = amount[1];
    const stated = centsOf(amount[2]);
    const fx = FX_USD.exec(body);
    const amountCents =
      currency === "USD" ? stated : fx ? Math.sign(stated) * centsOf(fx[1]) : stated;

    const lines = body.split("\n").slice(1);
    const parts: string[] = [];
    const inline = start.head.includes(":")
      ? start.head.slice(start.head.indexOf(":") + 1).trim()
      : "";
    if (inline) parts.push(inline);
    for (const raw of lines) {
      const line = raw.trim();
      if (line === "") continue;
      if (COUNTERPARTY_STOP.some((stop) => stop.test(line))) break;
      parts.push(line);
    }

    const funding = FUNDING_KEY.exec(body);
    const ref = /^Ref ID:\s*(\S+)$/m.exec(body);
    const kind = kindOf(start.head);
    entries.push({
      externalId: id[1],
      refId: ref ? ref[1] : null,
      date: `${start.year}-${start.month}-${start.day}`,
      kind: kind === "payment" && amountCents > 0 ? "receipt" : kind,
      counterparty: parts.join(" ").trim(),
      amountCents,
      fundingKey: funding ? funding[1] : null,
    });
  });

  return entries;
}
