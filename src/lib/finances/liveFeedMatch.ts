/**
 * Recognising that a live-feed row and a bank-statement row are the same event.
 *
 * Deliberately **not** `matchExisting.ts`. That module compares two file exports of the
 * same transaction, which broadly agree; loosening it would loosen CSV-to-CSV dedup too,
 * and that works. This one exists because a live feed and a bank statement disagree in two
 * specific ways, both measured against real accounts rather than imagined:
 *
 * **Dates are off by a day or two.** The aggregator reports when the merchant authorised
 * the charge; the statement records the bank's own transaction date. For one Chase card
 * over three months, 176 of 217 rows differed by exactly one day with byte-identical
 * descriptions. An exact-date rule matched none of them.
 *
 * **Descriptions get wrapped, or shortened to a brand.** The Capital One 360 export writes
 * `Withdrawal from RENT:RAULIN RENT:RAULI` where the feed says `RENT:RAULIN`; the shared
 * matcher requires one string to be a *prefix* of the other, and here the feed's text sits
 * in the middle. A bank's own transaction page goes the other way and publishes a cleaned
 * display name — `Pizza Hut`, `Walmart`, `CVS`, `Go Daddy` — against the descriptors
 * `PIZZA HUT 036874`, `WAL-MART #1981`, `CVS/PHARMACY #01522`, `GODADDY.COM` that SimpleFIN
 * and the CSV download carry for the same charge.
 *
 * So `descriptionsOverlap` runs five rules, in order: fold-equality, containment above an
 * eleven-character floor, a **payment-posting** match, a **known merchant alias**, and a
 * **brand stem** — the shorter side, reduced to its alphanumerics, prefixing the longer. Each
 * rule is a different shape of disagreement and each carries its own defence:
 *
 * - The containment floor keeps a bare processor stamp (`PAYPAL`, `SQ *`) from matching
 *   every row that mentions it.
 * - A card's own pending list names an account payment by its *source* (`Payment from
 *   CAPITAL ONE N.A. ...2322`) where SimpleFIN names it by the *channel*
 *   (`CAPITAL ONE ONLINE PYMT`) — opening words that share nothing, so containment and the
 *   brand stem both refuse it and the browser-sourced row never retires, permanently
 *   double-counting the payment as an unmatched transfer. Both sides matching a known
 *   payment-wording pattern is treated as the same signal D4 already accepts for a lost
 *   hold: `sameEvent`'s exact amount and tight date window are doing the identity work, so
 *   two distinct real payments to the same card, of the same amount, days apart, is not a
 *   realistic coincidence.
 * - A handful of merchants (`Walmart`, `Domino's Pizza`, `Spotify`) diverge from their feed
 *   descriptor by more than punctuation — a different storefront name, an extra category
 *   word, or a processor's second star ahead of a per-charge reference. `MERCHANT_ALIASES`
 *   lists exactly the confirmed cases, anchored so it cannot widen into a general rule.
 * - The brand stem has to reach below that floor (`CVS` is three characters), so it is
 *   **prefix-anchored** instead — `CVS` matches `CVS/PHARMACY` but not `MYCVSSTORE` — and
 *   it **refuses a `*` boundary**: the text after the stem beginning with `*` means the
 *   descriptor names a different counterparty behind a processor, which is exactly the
 *   `PAYPAL` / `PAYPAL *PADDLE.NET` and `TST*` / `TST*BAKERY` case.
 *
 * The direction of error matters and is chosen deliberately. A missed match inserts a
 * duplicate: visible in the register, and deletable. An over-eager match drops a real
 * transaction: invisible, and `fingerprint.ts` already names that as the worse outcome. So
 * every rule below requires an **exact amount**, a date within two days on *some* pair of
 * the two rows' date axes, and a substantial description overlap; and every match is
 * occurrence-counted, so one stored row can absorb only one incoming row.
 *
 * **Two sources date one event on different axes.** A bank page reports the purchase date
 * while an aggregator reports the posted date; 220 of 4,345 Capital One rows in this
 * register post three or more days after purchase. Both sides store `postedDate`, so
 * `dateDistance` takes the closest of the four transaction/posted pairings rather than
 * comparing transaction dates alone.
 *
 * Used in **both** directions. A sync compares what the provider sent against rows the
 * statements already wrote; an import compares statement rows against what the sync already
 * wrote. The second is the one that bites later — a statement imported weeks after the sync
 * covers days the sync already has.
 */

import { descriptionsMatch } from "./matchExisting";

/** How far apart two records of one event may be dated. */
export const DATE_TOLERANCE_DAYS = 2;

/**
 * Shortest description that may be matched by containment.
 *
 * Without a floor, a feed description of `PAYPAL` would match every statement row
 * mentioning PayPal at the same amount. Eleven characters is comfortably longer than the
 * bare processor stamps (`PAYPAL`, `SQ *`, `TST*`) and shorter than every real counterparty
 * observed in the data this was measured against.
 */
const MIN_CONTAINMENT_LENGTH = 11;

/**
 * Shortest brand stem that may anchor a page display name to a bank descriptor.
 *
 * Three characters is `CVS`, the shortest real brand observed. It is safe that low only
 * because the stem must *prefix* the descriptor and must not be followed by a `*`.
 */
const MIN_BRAND_STEM = 3;

/** A leading payment-processor stamp: `PP*`, `SQ *`, `TST*`, `PAYPAL *`. */
const PROCESSOR_STAMP = /^[A-Z]{2,6}\s*\*\s*/;

/**
 * A run of digits SimpleFIN masked out. It overwrites them — and the space before them —
 * with `X`s glued to the name: Capital One's `STARBUCKS 8007827282` arrives as
 * `STARBUCKSXXXXXXXXXXX`, which no stem or containment rule can see into. Four is the
 * shortest run observed (account masks are `XXXXXXX2603`), and no merchant spells one.
 */
const MASKED_DIGITS = /X{4,}/g;

/** Every spelling of one folded description the alias and stem rules should try. */
function comparableForms(folded: string): string[] {
  const unstamped = folded.replace(PROCESSOR_STAMP, "");
  return [folded, unstamped, ...[folded, unstamped].map(unmasked)];
}

function unmasked(folded: string): string {
  return folded.replace(MASKED_DIGITS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Known wordings for one side or the other of an account-payment posting.
 *
 * A card's own pending page names the payment by where the money came from; a history feed
 * names it by the channel that moved it. Neither is a substring or a prefix of the other, so
 * this is a separate rule rather than a wider containment or brand-stem floor.
 */
const PAYMENT_POSTING_PATTERNS: readonly RegExp[] = [
  /^PAYMENT FROM /,
  /(MOBILE|ONLINE) (PMT|PYMT)/,
  /CREDIT CRD (EPAY|AUTOPAY)/,
  /PAYMENT THANK YOU/,
  /AUTOMATIC PAYMENT/,
];

/** Does this folded description read as an account-payment posting, on either feed? */
function looksLikePaymentPosting(folded: string): boolean {
  return PAYMENT_POSTING_PATTERNS.some((pattern) => pattern.test(folded));
}

/**
 * Merchants whose Capital One display name and feed descriptor diverge past what containment
 * or the brand stem can bridge — verified against Lee's own account, not guessed.
 *
 * `WALMART` → `WM SUPERCENTER #1981` shares no prefix at all (Capital One posts the *same*
 * store, on different charges, as both `WAL-MART #1981` — which the brand stem already
 * reaches — and `WM SUPERCENTER #1981`, which it cannot). `DOMINO'S PIZZA` → `DOMINO'S 4690`
 * fails because the page's own name carries a category word the descriptor drops, so the
 * shorter side's alphanumerics run past what the longer side shares. `SPOTIFY` →
 * `PP*SPOTIFY*P46D197980` reaches the brand stem's `*`-boundary refusal — which exists to
 * stop `TST*BAKERY` from matching a bare `TST*` — because Spotify's processor appends a
 * second star before its own per-charge reference, a shape indistinguishable by punctuation
 * alone from a processor handing off to a different counterparty.
 *
 * `short` must match one side exactly (after `alnum`); `longPrefixes` only need to prefix the
 * other side, the same anchoring `brandStemPrefixes` uses elsewhere. Add an entry here — never
 * loosen the general rules above — when a *specific*, confirmed merchant repeats this
 * disagreement; see `liveFeedMatch.test.ts` for how each entry was verified against real data.
 */
const MERCHANT_ALIASES: readonly { short: string; longPrefixes: readonly string[] }[] =
  [
    { short: "WALMART", longPrefixes: ["WMSUPERCENTER"] },
    { short: "DOMINOSPIZZA", longPrefixes: ["DOMINOS"] },
    { short: "SPOTIFY", longPrefixes: ["SPOTIFY"] },
  ];

/** Does one side exactly name a known merchant whose feed descriptor the other side carries? */
function matchesMerchantAlias(a: string, b: string): boolean {
  const [x, y] = [alnum(a), alnum(b)];
  return MERCHANT_ALIASES.some(
    ({ short, longPrefixes }) =>
      (x === short && longPrefixes.some((prefix) => y.startsWith(prefix))) ||
      (y === short && longPrefixes.some((prefix) => x.startsWith(prefix))),
  );
}

function fold(description: string): string {
  return description.replace(/\s+/g, " ").trim().toUpperCase();
}

function alnum(folded: string): string {
  return folded.replace(/[^A-Z0-9]/g, "");
}

function daysApart(a: string, b: string): number {
  return (
    Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
  );
}

/** Anything carrying the two date axes a bank row can be dated on. */
export type DatedRow = { transactionDate: string; postedDate?: string | null };

/**
 * How far apart two records of one event are dated, across both axes each side stores.
 *
 * The minimum over every non-null pairing of `{transactionDate, postedDate}`: a bank page's
 * purchase date and an aggregator's posted date describe the same charge, and either side's
 * two dates can be days apart.
 */
export function dateDistance(existing: DatedRow, incoming: DatedRow): number {
  const left = [existing.transactionDate, existing.postedDate ?? null];
  const right = [incoming.transactionDate, incoming.postedDate ?? null];
  let best = Number.POSITIVE_INFINITY;
  for (const a of left) {
    if (!a) continue;
    for (const b of right) {
      if (!b) continue;
      const distance = daysApart(a, b);
      if (distance < best) best = distance;
    }
  }
  return best;
}

/**
 * Does the shorter folded string name the brand the longer one elaborates?
 *
 * Punctuation and spacing are ignored, which is what bridges `Walmart`/`WAL-MART #1981`
 * and `Go Daddy`/`GODADDY.COM`. The stem must start the descriptor, so `CVS` reaches
 * `CVS/PHARMACY #01522` but not `MYCVSSTORE`; and whatever follows the stem may not open
 * with a `*`, because that marks a processor handing off to a different counterparty.
 */
function brandStemPrefixes(left: string, right: string): boolean {
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const stem = alnum(shorter);
  const body = alnum(longer);
  if (stem.length < MIN_BRAND_STEM) return false;
  if (!body.startsWith(stem)) return false;

  // Walk the folded descriptor to where the stem's alphanumerics run out, so the boundary
  // test sees the punctuation the stem comparison threw away.
  let consumed = 0;
  let index = 0;
  while (index < longer.length && consumed < stem.length) {
    if (/[A-Z0-9]/.test(longer[index])) consumed++;
    index++;
  }
  return !/^ *\*/.test(longer.slice(index));
}

/**
 * Do these two descriptions name the same counterparty?
 *
 * Equality first; then containment either way round — the wrapper can be on either side,
 * since a statement may pad what the feed reports or the reverse; then a payment-posting
 * match, for the one case where neither side's wording appears in the other at all; then a
 * known merchant alias; then the brand stem, which is what recognises a bank page's display
 * name in a full descriptor. Both the alias and stem rules are tried against each side with a
 * leading processor stamp stripped as well, so `Apple` reaches `PP*APPLE.COM/BILL` and
 * `Spotify` reaches `PP*SPOTIFY*P46D197980`, and with SimpleFIN's masked digits stripped, so
 * `STARBUCKSXXXXXXXXXXX` reaches `STARBUCKS 8007827282`.
 */
export function descriptionsOverlap(a: string, b: string): boolean {
  const left = fold(a);
  const right = fold(b);
  if (left === right) return true;
  if (left === "" || right === "") return false;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length >= MIN_CONTAINMENT_LENGTH && longer.includes(shorter)) return true;

  if (looksLikePaymentPosting(left) && looksLikePaymentPosting(right)) return true;

  const leftForms = comparableForms(left);
  const rightForms = comparableForms(right);
  return leftForms.some((one) =>
    rightForms.some(
      (other) =>
        one !== "" &&
        other !== "" &&
        (matchesMerchantAlias(one, other) || brandStemPrefixes(one, other)),
    ),
  );
}

export type ComparableRow = {
  transactionDate: string;
  amountCents: number;
  description: string;
  /** The bank's posting day when the source distinguishes it from the purchase day. */
  postedDate?: string | null;
};

function sameEvent(existing: ComparableRow, incoming: ComparableRow): boolean {
  return (
    existing.amountCents === incoming.amountCents &&
    dateDistance(existing, incoming) <= DATE_TOLERANCE_DAYS &&
    descriptionsOverlap(existing.description, incoming.description)
  );
}

/**
 * Which incoming rows are not already present, occurrence-counted.
 *
 * The counting is what keeps two identical charges on one day from collapsing into one —
 * the case `fingerprint.ts` was written for. Each existing row can absorb at most one
 * incoming row, so a second identical charge still imports when only one is on file.
 *
 * Nearest date wins when several existing rows could absorb the same incoming row, so a
 * recurring charge pairs with its own occurrence rather than the first one scanned.
 */
export function selectUnmatched<T extends ComparableRow>(
  existing: readonly ComparableRow[],
  incoming: readonly T[],
): { keep: T[]; matchedCount: number } {
  const used = new Array<boolean>(existing.length).fill(false);
  const keep: T[] = [];
  let matchedCount = 0;

  for (const row of incoming) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < existing.length; i++) {
      if (used[i] || !sameEvent(existing[i], row)) continue;
      const distance = dateDistance(existing[i], row);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      used[bestIndex] = true;
      matchedCount++;
    } else {
      keep.push(row);
    }
  }

  return { keep, matchedCount };
}

/** An existing register row, tagged with which comparison applies to it. */
export type TaggedRow = ComparableRow & {
  /** True for rows a live feed wrote, which are the ones dated approximately. */
  fromLiveFeed: boolean;
};

/** Strict comparison: what `matchExisting` does, for rows that came from a file. */
function sameFileEvent(existing: ComparableRow, incoming: ComparableRow): boolean {
  return (
    existing.transactionDate === incoming.transactionDate &&
    existing.amountCents === incoming.amountCents &&
    descriptionsMatch(existing.description, incoming.description)
  );
}

/**
 * Which incoming rows are new, against a register holding rows from both kinds of source.
 *
 * This is the importer's entry point once a live feed exists. A statement row is compared
 * strictly against other statement rows — unchanged behaviour, and the reason CSV-to-CSV
 * dedup keeps working — but **tolerantly against rows the feed wrote**, because those carry
 * the aggregator's date rather than the bank's and will not line up exactly.
 *
 * Occurrence-counted, so two identical charges on one day still both import when only one is
 * on file.
 */
export function selectNewAgainstMixed<T extends ComparableRow>(
  existing: readonly TaggedRow[],
  incoming: readonly T[],
): { keep: T[]; skipCount: number } {
  const used = new Array<boolean>(existing.length).fill(false);
  const keep: T[] = [];

  for (const row of incoming) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < existing.length; i++) {
      if (used[i]) continue;
      const candidate = existing[i];
      const matches = candidate.fromLiveFeed
        ? sameEvent(candidate, row)
        : sameFileEvent(candidate, row);
      if (!matches) continue;
      const distance = dateDistance(candidate, row);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) used[bestIndex] = true;
    else keep.push(row);
  }

  return { keep, skipCount: incoming.length - keep.length };
}
