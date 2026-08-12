import type { FinanceAccountKind } from "@/db/schema";
import { parseCsvRows } from "@/lib/csv/text";
import { parseAmountCents } from "./money";
import type {
  FinanceFeed,
  ParsedAccount,
  ParsedFinanceCsv,
  ParsedTransaction,
  RowError,
} from "./types";

/**
 * Reading the four CSV exports Lee's banks produce into one shape.
 *
 * Each feed encodes the amount differently — Chase signs it, Capital One's card splits it
 * across Debit and Credit columns, Capital One's bank leaves it unsigned and puts the
 * direction in a Type column — and all three are normalised here onto the single rule the
 * rest of the module relies on: **positive is money into the account.** A card purchase is
 * negative, a payment to the card positive; a deposit positive, a withdrawal negative. One
 * rule for every account kind is what keeps sums and balances from branching.
 *
 * Parsing is pure: no database, no account ids. Resolving accounts and assigning dedup
 * fingerprints happens in `import.ts`, against rows this produces.
 */

/** Header cells, lowercased and stripped of spaces and punctuation, for matching. */
function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADERS: Record<FinanceFeed, readonly string[]> = {
  // Chase's "Post Date" against Capital One's "Posted Date" is the whole difference between
  // the two card formats' first columns, so match on a column only one of them has.
  "csv:chase-credit": ["transactiondate", "postdate", "description", "type", "amount"],
  "csv:capitalone-card": ["transactiondate", "posteddate", "cardno", "debit", "credit"],
  "csv:capitalone-bank": [
    "accountnumber",
    "transactiondescription",
    "transactiondate",
    "transactiontype",
    "transactionamount",
  ],
};

/**
 * Which feed a file is, from its header row alone. Returns null when nothing matches, which
 * the caller reports as "unrecognised format" naming the file.
 */
export function detectFeed(headerCells: readonly string[]): FinanceFeed | null {
  const present = new Set(headerCells.map(normalizeHeader));
  for (const [feed, required] of Object.entries(HEADERS) as [
    FinanceFeed,
    readonly string[],
  ][]) {
    if (required.every((column) => present.has(column))) return feed;
  }
  return null;
}

/**
 * Two-digit years use the POSIX pivot: 69–99 are 1900s, 00–68 are 2000s. Only the Capital
 * One bank exports are ambiguous this way, and their history starts in 2024, so the pivot
 * never actually fires — it is here so a stray old row lands in the right century rather
 * than 2,000 years out.
 */
function expandTwoDigitYear(yy: number): number {
  return yy <= 68 ? 2000 + yy : 1900 + yy;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function toDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse the three date shapes these exports use into a `YYYY-MM-DD` calendar day:
 * `MM/DD/YYYY` (Chase), `MM/DD/YY` (Capital One bank), `YYYY-MM-DD` (Capital One card).
 *
 * Deliberately string-to-string. These are calendar days, not instants — routing them
 * through `new Date(...)` in local time is how an August 1 becomes a July 31.
 */
export function parseCsvDate(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const [, y, m, d] = iso;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    return isRealDate(year, month, day) ? toDateKey(year, month, day) : null;
  }

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (slashed) {
    const [, m, d, y] = slashed;
    const year = y.length === 2 ? expandTwoDigitYear(Number(y)) : Number(y);
    const month = Number(m);
    const day = Number(d);
    return isRealDate(year, month, day) ? toDateKey(year, month, day) : null;
  }

  return null;
}

/** Index every header cell by its normalised name. */
function headerIndex(headerCells: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();
  headerCells.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    if (!index.has(key)) index.set(key, i);
  });
  return index;
}

function cell(cells: readonly string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (cells[index] ?? "").trim();
}

/**
 * Chase writes no account number anywhere in the file — the only identifier is the `9910` in
 * `Chase9910_Activity_20260812.csv`. So the filename is load-bearing for this one feed, and a
 * renamed file has to fail with a message that says exactly that.
 */
function chaseAccountKeyFromFileName(fileName: string): string | null {
  const match = /chase[^0-9]*(\d{4})/i.exec(fileName);
  return match ? match[1] : null;
}

/** `360PerformanceSavings` → `360 Performance Savings`. */
function spaceOutCamelCase(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The Capital One bank exports are named `2026-08-12_360Checking...2322.csv`, which is where
 * the product name and hence the account kind lives — the rows themselves only carry a
 * number. A renamed file still imports; it just gets a generic name and `checking`.
 */
function capitalOneBankNaming(fileName: string): {
  label: string;
  kind: FinanceAccountKind;
} {
  const match = /_([A-Za-z0-9]*(?:Checking|Savings)[A-Za-z0-9]*)/i.exec(fileName);
  const label = match ? spaceOutCamelCase(match[1]) : "";
  const kind: FinanceAccountKind = /savings/i.test(fileName) ? "savings" : "checking";
  return { label, kind };
}

/** `•••2322`, so the register reads like a statement rather than a database. */
function maskedName(prefix: string, key: string): string {
  return `${prefix} •••${key}`;
}

type RowParser = (
  cells: readonly string[],
  index: Map<string, number>,
) =>
  | { ok: true; accountKey: string | null; transaction: ParsedTransaction }
  | { ok: false; message: string };

const parseChaseRow: RowParser = (cells, index) => {
  const transactionDate = parseCsvDate(cell(cells, index.get("transactiondate")));
  if (!transactionDate) {
    return {
      ok: false,
      message: `Unreadable transaction date "${cell(cells, index.get("transactiondate"))}".`,
    };
  }
  const amountCents = parseAmountCents(cell(cells, index.get("amount")));
  if (amountCents === null) {
    return {
      ok: false,
      message: `Unreadable amount "${cell(cells, index.get("amount"))}".`,
    };
  }

  return {
    ok: true,
    // Chase has no account column at all; the caller supplies the key from the filename.
    accountKey: null,
    transaction: {
      transactionDate,
      postedDate: parseCsvDate(cell(cells, index.get("postdate"))),
      description: cell(cells, index.get("description")),
      // Chase's Amount is already signed the way we want: negative for a purchase.
      amountCents,
      sourceCategory: cell(cells, index.get("category")),
      memo: cell(cells, index.get("memo")),
      balanceAfterCents: null,
    },
  };
};

const parseCapitalOneCardRow: RowParser = (cells, index) => {
  const transactionDate = parseCsvDate(cell(cells, index.get("transactiondate")));
  if (!transactionDate) {
    return {
      ok: false,
      message: `Unreadable transaction date "${cell(cells, index.get("transactiondate"))}".`,
    };
  }

  const debit = parseAmountCents(cell(cells, index.get("debit")));
  const credit = parseAmountCents(cell(cells, index.get("credit")));
  if (debit === null && credit === null) {
    return { ok: false, message: "Row has neither a Debit nor a Credit amount." };
  }
  if (debit !== null && credit !== null) {
    return { ok: false, message: "Row has both a Debit and a Credit amount." };
  }

  // Debit is a purchase (money out of the card account), Credit a payment or refund.
  const amountCents = debit !== null ? -debit : (credit as number);

  return {
    ok: true,
    accountKey: cell(cells, index.get("cardno")) || null,
    transaction: {
      transactionDate,
      postedDate: parseCsvDate(cell(cells, index.get("posteddate"))),
      description: cell(cells, index.get("description")),
      amountCents,
      sourceCategory: cell(cells, index.get("category")),
      memo: "",
      balanceAfterCents: null,
    },
  };
};

const parseCapitalOneBankRow: RowParser = (cells, index) => {
  const transactionDate = parseCsvDate(cell(cells, index.get("transactiondate")));
  if (!transactionDate) {
    return {
      ok: false,
      message: `Unreadable transaction date "${cell(cells, index.get("transactiondate"))}".`,
    };
  }

  const magnitude = parseAmountCents(cell(cells, index.get("transactionamount")));
  if (magnitude === null) {
    return {
      ok: false,
      message: `Unreadable amount "${cell(cells, index.get("transactionamount"))}".`,
    };
  }

  const type = cell(cells, index.get("transactiontype")).toLowerCase();
  if (type !== "debit" && type !== "credit") {
    return { ok: false, message: `Unknown transaction type "${type || "(empty)"}".` };
  }

  // The amount column is unsigned here; direction lives entirely in the type.
  const amountCents = type === "debit" ? -Math.abs(magnitude) : Math.abs(magnitude);

  return {
    ok: true,
    accountKey: cell(cells, index.get("accountnumber")) || null,
    transaction: {
      transactionDate,
      // This feed reports one date only.
      postedDate: null,
      description: cell(cells, index.get("transactiondescription")),
      amountCents,
      // This feed has no category column at all.
      sourceCategory: "",
      memo: "",
      balanceAfterCents: parseAmountCents(cell(cells, index.get("balance"))),
    },
  };
};

const ROW_PARSERS: Record<FinanceFeed, RowParser> = {
  "csv:chase-credit": parseChaseRow,
  "csv:capitalone-card": parseCapitalOneCardRow,
  "csv:capitalone-bank": parseCapitalOneBankRow,
};

function accountNaming(
  feed: FinanceFeed,
  externalKey: string,
  fileName: string,
): { name: string; institution: string; kind: FinanceAccountKind } {
  if (feed === "csv:chase-credit") {
    return {
      name: maskedName("Chase", externalKey),
      institution: "Chase",
      kind: "credit_card",
    };
  }
  if (feed === "csv:capitalone-card") {
    return {
      name: maskedName("Capital One", externalKey),
      institution: "Capital One",
      kind: "credit_card",
    };
  }
  const { label, kind } = capitalOneBankNaming(fileName);
  return {
    name: maskedName(label || "Capital One", externalKey),
    institution: "Capital One",
    kind,
  };
}

export type ParseFailure = { ok: false; error: string };
export type ParseSuccess = { ok: true; parsed: ParsedFinanceCsv };

/**
 * Parse one CSV export into per-account groups of normalised transactions.
 *
 * Rows are grouped by the account key the file itself carries, rather than assuming one
 * account per file: the bank formats repeat an account number on every row, and a combined
 * export would otherwise pile two accounts into one.
 *
 * Bad rows become entries in `errors` and are skipped; only a file that cannot be
 * identified at all fails outright.
 */
export function parseFinanceCsv(
  fileName: string,
  text: string,
): ParseSuccess | ParseFailure {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { ok: false, error: `"${fileName}" is empty.` };
  }

  const feed = detectFeed(rows[0]);
  if (!feed) {
    return {
      ok: false,
      error: `"${fileName}" is not a recognised export. Expected a Chase credit card, Capital One card, or Capital One 360 bank CSV.`,
    };
  }

  const fallbackKey =
    feed === "csv:chase-credit" ? chaseAccountKeyFromFileName(fileName) : null;
  if (feed === "csv:chase-credit" && !fallbackKey) {
    return {
      ok: false,
      error: `"${fileName}" is a Chase export, but Chase does not put the account number in the file — it is only in the filename. Re-download it, or rename the file so it contains "Chase" followed by the last four digits (for example Chase9910_Activity.csv).`,
    };
  }

  const index = headerIndex(rows[0]);
  const parseRow = ROW_PARSERS[feed];
  const errors: RowError[] = [];
  const grouped = new Map<string, ParsedTransaction[]>();

  for (let i = 1; i < rows.length; i++) {
    // Header is row 1, the way a spreadsheet numbers it.
    const rowNumber = i + 1;
    const cells = rows[i];
    if (cells.every((value) => value.trim() === "")) continue;

    const result = parseRow(cells, index);
    if (!result.ok) {
      errors.push({ row: rowNumber, message: result.message });
      continue;
    }

    const key = result.accountKey ?? fallbackKey;
    if (!key) {
      errors.push({ row: rowNumber, message: "Row has no account number." });
      continue;
    }

    const bucket = grouped.get(key);
    if (bucket) bucket.push(result.transaction);
    else grouped.set(key, [result.transaction]);
  }

  const accounts: ParsedAccount[] = [...grouped].map(([externalKey, transactions]) => ({
    externalKey,
    transactions,
    ...accountNaming(feed, externalKey, fileName),
  }));

  return { ok: true, parsed: { feed, accounts, errors } };
}
