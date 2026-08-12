import { parseCsvDate } from "./formats";
import { parseAmountCents } from "./money";
import type {
  ParsedAccount,
  ParsedFinanceCsv,
  ParsedStatement,
  ParsedStatementRate,
  ParsedTransaction,
  RowError,
} from "./types";

/**
 * Reading a Chase Prime Visa monthly statement into the same shape the Chase CSV parser
 * produces, plus a statement snapshot.
 *
 * The PDF text is a visual dump: the remittance coupon reprints New Balance, page headers
 * land in the middle of the ledger, Amazon order numbers wrap onto the next line, and a
 * Shop-with-Points section restates some purchases with a rewards column. Those restated
 * rows are not charges.
 *
 * Statement amounts use the cardholder convention (purchases positive). The register
 * wants the opposite, so every ledger amount is flipped. Merchant text is stripped down
 * to what the CSV contains so a later (or earlier) CSV import can recognise the same row.
 *
 * Account identity is the last four in the filename, not the printed PAN — Chase reissued
 * this card (4903 → 8570 → 9910) and the CSV already lives under `9910`.
 */

export type ParseFailure = { ok: false; error: string };
export type ParseSuccess = { ok: true; parsed: ParsedFinanceCsv };

const PERIOD =
  /Opening\/Closing Date\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/;
const STATEMENT_DATE = /Statement Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/;
const DUE_DATE = /Payment Due Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/;
const NEW_BALANCE = /New Balance:\s*(\$?[\d,]+\.\d{2})/;
const PREVIOUS = /Previous Balance\s+(\$?[\d,]+\.\d{2})/;
const MIN_PAY = /Minimum Payment Due:\s*(\$?[\d,]+\.\d{2})/;
const PAST_DUE = /Past Due Amount\s+(\$?[\d,]+\.\d{2})/;
const CREDIT_LINE = /(?<!over the )Credit Access Line\s+(\$?[\d,]+(?:\.\d{2})?)/;
const AVAIL_CREDIT = /Available Credit\s+(\$?[\d,]+(?:\.\d{2})?)/;
const PAYMENTS = /Payment, Credits\s+([+\-]?\$?[\d,]+\.\d{2})/;
const PURCHASES = /(?:^|\n)Purchases\s+([+\-]?\$?[\d,]+\.\d{2})/;
const CASH = /Cash Advances\s+([+\-]?\$?[\d,]+\.\d{2})/;
const TRANSFERS = /Balance Transfers\s+([+\-]?\$?[\d,]+\.\d{2})/;
const FEES = /Fees Charged\s+([+\-]?\$?[\d,]+\.\d{2})/;
const INTEREST = /Interest Charged\s+([+\-]?\$?[\d,]+\.\d{2})/;
const YTD_FEES = /Total fees charged in \d{4}\s+(\$?[\d,]+\.\d{2})/;
const YTD_INT = /Total interest charged in \d{4}\s+(\$?[\d,]+\.\d{2})/;
const POINTS = /redemption\s+([\d,]+)/i;

const ACTIVITY = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?[\d,]*\.\d{2})(?:\s+([\d,]+))?$/;
const RATE =
  /^(Purchases(?: prior to \d{2}\/\d{2}\/\d{4})?|Cash Advances|Balance Transfers)\s+(\d+\.\d+)%\S*\s+(.+)$/;

const SUPPORTED =
  "Supported PDFs are Chase Prime Visa monthly statements and Capital One 360 monthly bank statements.";

export function looksLikeChaseCreditStatement(text: string): boolean {
  if (!/Opening\/Closing Date/i.test(text)) return false;
  if (
    /360 Checking|360 Performance Savings/i.test(text) &&
    /bank statement/i.test(text)
  ) {
    return false;
  }
  return (
    /Credit Access Line/i.test(text) ||
    /ACCOUNT ACTIVITY/i.test(text) ||
    /chase\.com\/cardhelp/i.test(text) ||
    /Prime Visa/i.test(text)
  );
}

export function chaseAccountKeyFromFileName(fileName: string): string | null {
  const statements = /statements-(\d{4})/i.exec(fileName);
  if (statements) return statements[1];
  const chase = /chase[^0-9]*(\d{4})/i.exec(fileName);
  return chase ? chase[1] : null;
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

function toDateKey(year: number, month: number, day: number): string | null {
  if (!isRealDate(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Period = { start: string; end: string; startYear: number; endYear: number };

function parsePeriod(text: string): Period | null {
  const match = PERIOD.exec(text);
  if (!match) return null;
  const start = parseCsvDate(match[1]);
  const end = parseCsvDate(match[2]);
  if (!start || !end) return null;
  return {
    start,
    end,
    startYear: Number(start.slice(0, 4)),
    endYear: Number(end.slice(0, 4)),
  };
}

function resolveLedgerDate(mmDd: string, period: Period): string | null {
  const parts = /^(\d{2})\/(\d{2})$/.exec(mmDd);
  if (!parts) return null;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const year =
    period.startYear === period.endYear
      ? period.startYear
      : month >= 7
        ? period.startYear
        : period.endYear;
  // Dec–Jan wrap: months on the start side of the new year keep startYear. July is a
  // safe split for a mid-month closing date (these close on the 18th).
  if (period.startYear !== period.endYear) {
    const startMonth = Number(period.start.slice(5, 7));
    const endMonth = Number(period.end.slice(5, 7));
    if (month === startMonth) return toDateKey(period.startYear, month, day);
    if (month === endMonth) return toDateKey(period.endYear, month, day);
    if (month > startMonth) return toDateKey(period.startYear, month, day);
    if (month < endMonth) return toDateKey(period.endYear, month, day);
  }
  return toDateKey(year, month, day);
}

/** Strip the location / phone / Amazon-bill suffix the CSV never has. */
export function normalizeChaseMerchant(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  text = text.replace(
    /\s*(?:Amzn\.com\/bill|amzn\.com\/bill|AMZN\.COM\/BILL)\s*/gi,
    " ",
  );
  text = text.replace(/\s*\d{3}-\d{3}-\d{4}\s*/g, " ");
  text = text.replace(/\s+[A-Z]{2}\s*$/g, "");
  return text.replace(/\s+/g, " ").trim();
}

function inferSourceCategory(description: string): string {
  if (/payment thank you|returned payment/i.test(description)) return "Payment";
  if (/interest charge/i.test(description)) return "Interest";
  if (/late fee|\bfee\b/i.test(description)) return "Fee";
  return "Purchase";
}

function firstAmount(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return parseAmountCents(match[1]);
}

function firstDate(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return parseCsvDate(match[1]);
}

function firstInteger(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Cardholder-convention cents → module sign (positive = money into the account). */
function flip(cents: number | null): number | null {
  return cents === null ? null : -cents;
}

function parseRateTail(tail: string): {
  balanceSubjectCents: number | null;
  interestChargedCents: number | null;
} {
  const empty = /-\s*0\s*-\s*-\s*0\s*-/.test(tail);
  if (empty) return { balanceSubjectCents: null, interestChargedCents: null };
  const amounts = [...tail.matchAll(/\$?([\d,]+\.\d{2})/g)].map((m) =>
    parseAmountCents(m[1]),
  );
  return {
    balanceSubjectCents: amounts[0] ?? null,
    interestChargedCents: flip(amounts[1] ?? null),
  };
}

function parseRates(lines: readonly string[]): ParsedStatementRate[] {
  const rates: ParsedStatementRate[] = [];
  for (const line of lines) {
    const match = RATE.exec(line);
    if (!match) continue;
    const aprPercent = Number(match[2]);
    if (!Number.isFinite(aprPercent)) continue;
    rates.push({
      balanceType: match[1],
      aprPercent,
      ...parseRateTail(match[3]),
    });
  }
  return rates;
}

function parseActivity(
  lines: readonly string[],
  period: Period,
  errors: RowError[],
): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let rewardsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^Split Transaction$/i.test(line) || /\$ Amount Rewards/i.test(line)) {
      rewardsSection = true;
      continue;
    }
    if (rewardsSection) continue;

    const row = ACTIVITY.exec(line);
    if (!row) continue;

    const [, mmDd, rawDescription, amountText, points] = row;
    if (points) continue;
    if (/^Order Number\b/i.test(rawDescription)) continue;

    const transactionDate = resolveLedgerDate(mmDd, period);
    if (!transactionDate) {
      errors.push({
        row: i + 1,
        message: `Unreadable transaction date "${mmDd}".`,
      });
      continue;
    }
    const statementCents = parseAmountCents(amountText);
    if (statementCents === null) {
      errors.push({
        row: i + 1,
        message: `Unreadable amount "${amountText}".`,
      });
      continue;
    }
    const description = normalizeChaseMerchant(rawDescription);
    if (description === "") continue;

    transactions.push({
      transactionDate,
      postedDate: null,
      description,
      amountCents: -statementCents,
      sourceCategory: inferSourceCategory(description),
      memo: "",
      balanceAfterCents: null,
    });
  }
  return transactions;
}

/**
 * Parse extracted text from one Chase Prime Visa monthly statement PDF.
 *
 * A file that is not this statement format fails outright. Individual unreadable
 * ledger rows become `errors` and are skipped.
 */
export function parseChaseCreditStatement(
  fileName: string,
  text: string,
): ParseSuccess | ParseFailure {
  if (!looksLikeChaseCreditStatement(text)) {
    return {
      ok: false,
      error: `"${fileName}" is not a recognised statement. ${SUPPORTED}`,
    };
  }

  const externalKey = chaseAccountKeyFromFileName(fileName);
  if (!externalKey) {
    return {
      ok: false,
      error: `"${fileName}" is a Chase statement, but the last four digits are only in the filename. Keep the bank's name (for example 20260718-statements-9910-.pdf) or include "Chase" followed by the last four.`,
    };
  }

  const period = parsePeriod(text);
  if (!period) {
    return {
      ok: false,
      error: `"${fileName}" looks like a Chase statement but has no readable opening/closing dates.`,
    };
  }

  const errors: RowError[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const transactions = parseActivity(lines, period, errors);

  const openingPrinted = firstAmount(text, PREVIOUS);
  const closingPrinted = firstAmount(text, NEW_BALANCE);
  if (openingPrinted === null || closingPrinted === null) {
    return {
      ok: false,
      error: `"${fileName}" looks like a Chase statement but has no readable previous/new balance.`,
    };
  }

  const openingBalanceCents = -openingPrinted;
  const closingBalanceCents = -closingPrinted;
  const activity = transactions.reduce((sum, row) => sum + row.amountCents, 0);
  if (openingBalanceCents + activity !== closingBalanceCents) {
    errors.push({
      row: 0,
      message: `${fileName} Chase •••${externalKey}: opening plus activity does not equal the statement closing balance.`,
    });
  }

  const account: ParsedAccount = {
    externalKey,
    name: `Chase •••${externalKey}`,
    institution: "Chase",
    kind: "credit_card",
    transactions,
  };

  const statement: ParsedStatement = {
    externalKey,
    periodStart: period.start,
    periodEnd: period.end,
    statementDate: firstDate(text, STATEMENT_DATE),
    openingBalanceCents,
    closingBalanceCents,
    paymentDueDate: firstDate(text, DUE_DATE),
    minimumPaymentCents: firstAmount(text, MIN_PAY),
    pastDueAmountCents: firstAmount(text, PAST_DUE),
    creditLimitCents: firstAmount(text, CREDIT_LINE),
    availableCreditCents: firstAmount(text, AVAIL_CREDIT),
    paymentsCreditsCents: flip(firstAmount(text, PAYMENTS)),
    purchasesCents: flip(firstAmount(text, PURCHASES)),
    cashAdvancesCents: flip(firstAmount(text, CASH)),
    balanceTransfersCents: flip(firstAmount(text, TRANSFERS)),
    feesChargedCents: flip(firstAmount(text, FEES)),
    interestChargedCents: flip(firstAmount(text, INTEREST)),
    ytdFeesCents: firstAmount(text, YTD_FEES),
    ytdInterestCents: firstAmount(text, YTD_INT),
    rewardsPoints: firstInteger(text, POINTS),
    rates: parseRates(lines),
  };

  return {
    ok: true,
    parsed: {
      feed: "csv:chase-credit",
      accounts: [account],
      statements: [statement],
      errors,
    },
  };
}
