import type { FinanceAccountKind } from "@/db/schema";
import { parseAmountCents } from "./money";
import type {
  ParsedAccount,
  ParsedFinanceCsv,
  ParsedStatement,
  ParsedTransaction,
  RowError,
} from "./types";

/**
 * Reading a Capital One 360 monthly statement (the combined checking / savings / CD PDF)
 * into the same shape the bank CSV parser produces.
 *
 * The PDF text is a visual dump, not a table: descriptions wrap, page headers reprint in
 * the middle of a ledger, and a handful of rows are notes rather than money movement
 * (rejected withdrawals, interest-rate changes). Those are skipped. Opening and closing
 * balances are not transactions; they are the reconcile check that proves we did not drop
 * or double-count a row.
 *
 * Dates on the ledger are `Jul 8` — the year lives on the statement period. Built as a
 * `YYYY-MM-DD` string, never routed through `Date`, for the same Aug-1-becomes-Jul-31
 * reason as `parseCsvDate`.
 */

const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const MONTH_ALT = Object.keys(MONTHS).join("|");
const DATE_START = new RegExp(`^(${MONTH_ALT}) (\\d{1,2})\\b`);
const ACCOUNT_HEADER = /^(360 Checking|360 Performance Savings|CD) - (\d+)$/;
const PERIOD =
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) - (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})\b/;
const CREDIT_DEBIT_TAIL =
  /\b(Credit|Debit)\s+([+\-]\s*\$[\d,]+\.\d{2})\s+([+\-]?\s*\$[\d,]+\.\d{2})\s*$/;
const OPENING_CLOSING =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})\s+(Opening|Closing) Balance\s+([+\-]?\s*\$[\d,]+\.\d{2})\s*$/;
const INFORMATIONAL =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})\s+(.+?)\s+([+\-]?\s*\$[\d,]+\.\d{2})\s*$/;

type Period = {
  startMonth: number;
  startDay: number;
  startYear: number;
  endMonth: number;
  endDay: number;
  endYear: number;
};

type AccountKindLabel = "360 Checking" | "360 Performance Savings" | "CD";

export type ParseFailure = { ok: false; error: string };
export type ParseSuccess = { ok: true; parsed: ParsedFinanceCsv };

export function looksLikeCapitalOne360Statement(text: string): boolean {
  return (
    /STATEMENT PERIOD/i.test(text) &&
    /bank statement/i.test(text) &&
    /(360 Checking|360 Performance Savings|CD)\s+-/i.test(text)
  );
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

function yearForMonth(month: number, period: Period): number {
  if (month === period.startMonth) return period.startYear;
  if (month === period.endMonth) return period.endYear;
  if (period.startYear === period.endYear) return period.startYear;
  return month >= period.startMonth ? period.startYear : period.endYear;
}

function resolveDate(
  monthName: string,
  dayText: string,
  period: Period,
): string | null {
  const month = MONTHS[monthName];
  const day = Number(dayText);
  if (!month) return null;
  return toDateKey(yearForMonth(month, period), month, day);
}

function parsePeriod(text: string): Period | null {
  const match = PERIOD.exec(text);
  if (!match) return null;
  const startMonth = MONTHS[match[1]];
  const endMonth = MONTHS[match[3]];
  const endYear = Number(match[5]);
  if (!startMonth || !endMonth) return null;
  // A Dec–Jan period prints one year (the end). Everything we have is a single month.
  const startYear = startMonth <= endMonth ? endYear : endYear - 1;
  return {
    startMonth,
    startDay: Number(match[2]),
    startYear,
    endMonth,
    endDay: Number(match[4]),
    endYear,
  };
}

function accountNaming(
  label: AccountKindLabel,
  accountNumber: string,
): {
  externalKey: string;
  name: string;
  institution: string;
  kind: FinanceAccountKind;
} {
  const externalKey = accountNumber.slice(-4);
  const institution = "Capital One";
  if (label === "360 Checking") {
    return {
      externalKey,
      name: `360 Checking •••${externalKey}`,
      institution,
      kind: "checking",
    };
  }
  if (label === "360 Performance Savings") {
    return {
      externalKey,
      name: `360 Performance Savings •••${externalKey}`,
      institution,
      kind: "savings",
    };
  }
  return {
    externalKey,
    name: `CD •••${externalKey}`,
    institution,
    kind: "investment",
  };
}

function isColumnHeader(line: string): boolean {
  return line === "DATE DESCRIPTION CATEGORY AMOUNT BALANCE";
}

function isLegalFooter(line: string): boolean {
  return line.startsWith("If anything in your statement looks incorrect");
}

function isStatementPeriodHeader(line: string): boolean {
  return /STATEMENT PERIOD/i.test(line);
}

function skipPageHeader(lines: readonly string[], start: number): number {
  let i = start + 1;
  if (i < lines.length && PERIOD.test(lines[i])) i += 1;
  // Name line (whatever the statement prints — do not match a specific person).
  if (
    i < lines.length &&
    lines[i] !== "" &&
    !/^Page \d+ of \d+$/.test(lines[i]) &&
    !DATE_START.test(lines[i]) &&
    !isColumnHeader(lines[i]) &&
    !ACCOUNT_HEADER.test(lines[i])
  ) {
    i += 1;
  }
  if (i < lines.length && /^Page \d+ of \d+$/.test(lines[i])) i += 1;
  if (i < lines.length && lines[i].startsWith("capitalone.com")) i += 1;
  if (i < lines.length && isColumnHeader(lines[i])) i += 1;
  return i;
}

type Collected = {
  text: string;
  lineNumber: number;
  next: number;
};

function collectRow(lines: readonly string[], start: number): Collected {
  const first = lines[start];
  let i = start + 1;
  if (
    OPENING_CLOSING.test(first) ||
    CREDIT_DEBIT_TAIL.test(first) ||
    (INFORMATIONAL.test(first) && !CREDIT_DEBIT_TAIL.test(first))
  ) {
    return { text: first, lineNumber: start + 1, next: i };
  }

  const parts = [first];
  while (i < lines.length) {
    const line = lines[i];
    if (isStatementPeriodHeader(line)) {
      i = skipPageHeader(lines, i);
      continue;
    }
    if (line === "" || isColumnHeader(line)) {
      i += 1;
      continue;
    }
    if (
      DATE_START.test(line) ||
      ACCOUNT_HEADER.test(line) ||
      /^Fees Summary$/i.test(line) ||
      isLegalFooter(line)
    ) {
      break;
    }
    parts.push(line);
    i += 1;
    if (CREDIT_DEBIT_TAIL.test(parts.join(" "))) break;
  }
  return { text: parts.join(" "), lineNumber: start + 1, next: i };
}

type WorkingAccount = {
  meta: ReturnType<typeof accountNaming>;
  transactions: ParsedTransaction[];
  openingCents: number | null;
  closingCents: number | null;
  closingDate: string | null;
  inFees: boolean;
};

function emptyCardFields(): Omit<
  ParsedStatement,
  | "externalKey"
  | "periodStart"
  | "periodEnd"
  | "statementDate"
  | "openingBalanceCents"
  | "closingBalanceCents"
> {
  return {
    paymentDueDate: null,
    minimumPaymentCents: null,
    pastDueAmountCents: null,
    creditLimitCents: null,
    availableCreditCents: null,
    paymentsCreditsCents: null,
    purchasesCents: null,
    cashAdvancesCents: null,
    balanceTransfersCents: null,
    feesChargedCents: null,
    interestChargedCents: null,
    ytdFeesCents: null,
    ytdInterestCents: null,
    rewardsPoints: null,
    rates: [],
  };
}

function finishAccount(
  fileName: string,
  working: WorkingAccount,
  period: Period,
  errors: RowError[],
  statements: ParsedStatement[],
): ParsedAccount {
  if (working.openingCents !== null && working.closingCents !== null) {
    const activity = working.transactions.reduce(
      (sum, row) => sum + row.amountCents,
      0,
    );
    const got = working.openingCents + activity;
    if (got !== working.closingCents) {
      errors.push({
        row: 0,
        message: `${fileName} ${working.meta.name}: opening plus activity does not equal the statement closing balance.`,
      });
    }
    const periodStart = toDateKey(period.startYear, period.startMonth, period.startDay);
    const periodEnd = toDateKey(period.endYear, period.endMonth, period.endDay);
    if (periodStart && periodEnd) {
      statements.push({
        externalKey: working.meta.externalKey,
        periodStart,
        periodEnd,
        statementDate: periodEnd,
        openingBalanceCents: working.openingCents,
        closingBalanceCents: working.closingCents,
        ...emptyCardFields(),
      });
    }
  }

  const closeOut = working.transactions.find((row) =>
    /cd close-out/i.test(row.description),
  );
  const closedOn =
    closeOut?.transactionDate ??
    (working.meta.kind === "investment" && working.closingCents === 0
      ? working.closingDate
      : null);

  return {
    ...working.meta,
    transactions: working.transactions,
    closedOn,
  };
}

/**
 * Parse extracted text from one Capital One 360 monthly statement PDF.
 *
 * A file that is not this statement format fails outright. Individual unreadable
 * ledger rows become `errors` and are skipped, the same way a bad CSV row is.
 */
export function parseCapitalOne360Statement(
  fileName: string,
  text: string,
): ParseSuccess | ParseFailure {
  if (!looksLikeCapitalOne360Statement(text)) {
    return {
      ok: false,
      error: `"${fileName}" is not a Capital One 360 monthly statement. Only those PDFs (checking, savings, and CD on one statement) are supported.`,
    };
  }

  const period = parsePeriod(text);
  if (!period) {
    return {
      ok: false,
      error: `"${fileName}" looks like a 360 statement but has no readable statement period.`,
    };
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const errors: RowError[] = [];
  const accounts: ParsedAccount[] = [];
  const statements: ParsedStatement[] = [];
  let current: WorkingAccount | null = null;

  const flush = () => {
    if (!current) return;
    accounts.push(finishAccount(fileName, current, period, errors, statements));
    current = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isLegalFooter(line)) break;
    if (isStatementPeriodHeader(line)) {
      i = skipPageHeader(lines, i);
      continue;
    }

    const header = ACCOUNT_HEADER.exec(line);
    if (header) {
      flush();
      current = {
        meta: accountNaming(header[1] as AccountKindLabel, header[2]),
        transactions: [],
        openingCents: null,
        closingCents: null,
        closingDate: null,
        inFees: false,
      };
      i += 1;
      continue;
    }

    if (!current || current.inFees) {
      i += 1;
      continue;
    }

    if (/^Fees Summary$/i.test(line)) {
      current.inFees = true;
      i += 1;
      continue;
    }

    if (!DATE_START.test(line)) {
      i += 1;
      continue;
    }

    const collected = collectRow(lines, i);
    i = collected.next;
    const row = collected.text;

    const bookend = OPENING_CLOSING.exec(row);
    if (bookend) {
      const date = resolveDate(bookend[1], bookend[2], period);
      const cents = parseAmountCents(bookend[4]);
      if (bookend[3] === "Opening") {
        current.openingCents = cents;
      } else {
        current.closingCents = cents;
        current.closingDate = date;
      }
      continue;
    }

    const money = CREDIT_DEBIT_TAIL.exec(row);
    if (money) {
      const dateMatch = DATE_START.exec(row);
      if (!dateMatch) {
        errors.push({
          row: collected.lineNumber,
          message: "Transaction has an amount but no date.",
        });
        continue;
      }
      const transactionDate = resolveDate(dateMatch[1], dateMatch[2], period);
      if (!transactionDate) {
        errors.push({
          row: collected.lineNumber,
          message: `Unreadable transaction date "${dateMatch[1]} ${dateMatch[2]}".`,
        });
        continue;
      }
      const amountCents = parseAmountCents(money[2]);
      if (amountCents === null) {
        errors.push({
          row: collected.lineNumber,
          message: `Unreadable amount "${money[2]}".`,
        });
        continue;
      }
      const description = row
        .slice(dateMatch[0].length, money.index)
        .trim()
        .replace(/\s+/g, " ");
      current.transactions.push({
        transactionDate,
        postedDate: null,
        description,
        amountCents,
        sourceCategory: "",
        memo: "",
        balanceAfterCents: parseAmountCents(money[3]),
      });
      continue;
    }

    const note = INFORMATIONAL.exec(row);
    if (note) {
      errors.push({
        row: collected.lineNumber,
        message: `Skipped informational row "${note[3]}".`,
      });
      continue;
    }

    errors.push({
      row: collected.lineNumber,
      message: `Unreadable ledger row "${row.slice(0, 80)}".`,
    });
  }

  flush();

  if (accounts.length === 0) {
    return {
      ok: false,
      error: `"${fileName}" is a 360 statement but had no readable account sections.`,
    };
  }

  return {
    ok: true,
    parsed: { feed: "csv:capitalone-bank", accounts, statements, errors },
  };
}
