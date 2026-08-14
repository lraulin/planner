import { parseAmountCents } from "./money";
import { looksLikeChaseCreditStatement } from "./chaseStatement";
import { looksLikeCapitalOne360Statement } from "./statement";
import {
  SUPPORTED_STATEMENT_PDFS,
  type ParsedAccount,
  type ParsedFinanceCsv,
  type ParsedStatement,
  type ParsedStatementRate,
  type ParsedTransaction,
  type RowError,
} from "./types";

/**
 * Reading a Capital One VentureOne monthly statement into the same shape the card
 * CSV parser produces, plus a statement snapshot.
 *
 * Two visual-dump layouts exist. Through early 2021 the ledger is `Mon D` plus a
 * wrapped description and the amount on its own line. From mid-2021 it is
 * `Mon D Mon D description $amount` (trans date, post date). Payments mash
 * `AuthDate` onto the merchant; later files drop that. Purchases print positive
 * and payments print with a leading minus — the register wants the opposite.
 *
 * Account identity is the last four in the filename, not the printed PAN.
 * Capital One reissued this card (1750 → 1797 → 3448) and the CSV already lives
 * under `3448`.
 */

export type ParseFailure = { ok: false; error: string };
export type ParseSuccess = { ok: true; parsed: ParsedFinanceCsv };

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

const MONTH = Object.keys(MONTHS).join("|");
const NAMED_DATE = new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2}),\\s+(\\d{4})\\b`);
const PERIOD = new RegExp(
  `(${MONTH})\\.?\\s+(\\d{1,2}),\\s+(\\d{4})\\s*-\\s*(${MONTH})\\.?\\s+(\\d{1,2}),\\s+(\\d{4})`,
);
const TWO_DATE = new RegExp(
  `^(${MONTH})\\s+(\\d{1,2})\\s+(${MONTH})\\s+(\\d{1,2})\\s+(.+)$`,
);
const ONE_DATE = new RegExp(`^(${MONTH})\\s+(\\d{1,2})\\s+(.+)$`);
const AMOUNT_TAIL = /^(.*?)\s+(-?\s*\$[\d,]+\.\d{2})\s*$/;
const LONE_AMOUNT = /^-?\s*\$[\d,]+\.\d{2}$/;
const AUTH_DATE_ONLY = /^\d{1,2}-[A-Za-z]{3}$/;
const RATE = /^(Purchases|Cash Advances|Balance Transfers)\s+(\d+\.\d+)%\S*\s+(.*)$/;

const US_STATE =
  /^(A[LKZR]|C[AOT]|DE|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$/;

const SUPPORTED = SUPPORTED_STATEMENT_PDFS;

export function looksLikeCapitalOneCardStatement(text: string): boolean {
  if (looksLikeCapitalOne360Statement(text)) return false;
  if (looksLikeChaseCreditStatement(text)) return false;
  if (!/capitalone\.com/i.test(text)) return false;
  if (!/Previous Balance/i.test(text) || !/New Balance/i.test(text)) {
    return false;
  }
  return (
    /VentureOne/i.test(text) ||
    /Visa (?:Platinum|Signature)/i.test(text) ||
    /Account Ending in/i.test(text) ||
    /ending in \d{4}/i.test(text) ||
    /days in Billing Cycle/i.test(text)
  );
}

export function capitalOneCardAccountKeyFromFileName(fileName: string): string | null {
  const statement = /(?:statement)[_\-]?(\d{6})[_\-](\d{4})/i.exec(fileName);
  if (statement) return statement[2];
  const trailing = /_(\d{4})\.pdf$/i.exec(fileName);
  if (trailing) return trailing[1];
  const named = /capital\s*one[^0-9]*(\d{4})/i.exec(fileName);
  return named ? named[1] : null;
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

function parseNamedDate(raw: string): string | null {
  const match = NAMED_DATE.exec(raw);
  if (!match) return null;
  return toDateKey(Number(match[3]), MONTHS[match[1]], Number(match[2]));
}

type Period = { start: string; end: string; startYear: number; endYear: number };

function parsePeriod(text: string): Period | null {
  const match = PERIOD.exec(text);
  if (!match) return null;
  const start = toDateKey(Number(match[3]), MONTHS[match[1]], Number(match[2]));
  const end = toDateKey(Number(match[6]), MONTHS[match[4]], Number(match[5]));
  if (!start || !end) return null;
  return {
    start,
    end,
    startYear: Number(start.slice(0, 4)),
    endYear: Number(end.slice(0, 4)),
  };
}

function resolveLedgerDate(month: number, day: number, period: Period): string | null {
  if (period.startYear === period.endYear) {
    return toDateKey(period.startYear, month, day);
  }
  const startMonth = Number(period.start.slice(5, 7));
  const endMonth = Number(period.end.slice(5, 7));
  if (month === startMonth) return toDateKey(period.startYear, month, day);
  if (month === endMonth) return toDateKey(period.endYear, month, day);
  if (month > startMonth) return toDateKey(period.startYear, month, day);
  if (month < endMonth) return toDateKey(period.endYear, month, day);
  return toDateKey(period.startYear, month, day);
}

/**
 * Strip the city / phone / bill / AuthDate suffix the card CSV does not have.
 * Store numbers and mashed ids like `CVSExtraCare 8007467287RI` stay.
 */
export function normalizeCapitalOneCardMerchant(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  // Mashed onto PYMT — there is no word boundary.
  text = text.replace(/AuthDate.*$/i, "");
  text = text.replace(
    /\s*(?:Amzn\.com\/bill|AMZN\.COM\/BILL|AMZNAMZN\.COM\/BILL)\s*/gi,
    " ",
  );
  text = text.replace(/https?:\/\/\S+/gi, " ");
  text = text.replace(/\s*TEAM-BANKING@\S*/gi, " ");
  text = text.replace(/\s*\d{3}-\d{3}-\d{4}\s*/g, " ");
  text = text.replace(/\s*\d{3}-\d{7}\s*/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  text = stripTrailingLocation(text);
  return text.replace(/\s+/g, " ").trim();
}

function stripTrailingLocation(raw: string): string {
  let text = raw.trim();
  for (let i = 0; i < 4; i++) {
    const next = stripOneTrailingToken(text);
    if (next === text) break;
    text = next;
  }
  return text;
}

function stripOneTrailingToken(text: string): string {
  // "Morrison-Clark Inn Washington DC" drops the city; "Smartrip Washington DC"
  // is the merchant the CSV already stored, so only peel when two+ words precede.
  const dc = /^(.*?)\s+WASHINGTON\s+DC$/i.exec(text);
  if (dc && dc[1].trim().split(/\s+/).length >= 2) return dc[1].trim();

  // Store / confirmation numbers have the city mashed on: `#1981CALIFORNIAMD`.
  // Require 3+ letters after the digits so `8007467287RI` (an ExtraCare id) stays.
  const afterStore = text.replace(/(#\d+)[A-Za-z]{3,}$/, "$1");
  if (afterStore !== text) return afterStore;
  const afterRef = text.replace(/(\d{5,})[A-Za-z]{4,}$/, "$1");
  if (afterRef !== text) return afterRef;

  const parts = text.split(" ");
  if (parts.length < 2) return text;
  const last = parts[parts.length - 1];
  const lastUpper = last.toUpperCase();

  if (lastUpper.length === 2 && US_STATE.test(lastUpper)) {
    return parts.slice(0, -1).join(" ");
  }
  if (/^[A-Za-z0-9-]+\.[A-Za-z.]+\.?$/.test(last)) {
    return parts.slice(0, -1).join(" ");
  }
  return text;
}

function inferSourceCategory(description: string): string {
  if (/capital one (?:mobile|online) pymt/i.test(description)) return "Payment/Credit";
  if (/interest charge/i.test(description)) return "Fee/Interest Charge";
  if (/\bfee\b/i.test(description)) return "Fee";
  return "Purchase";
}

function firstAmount(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return parseAmountCents(match[1]);
}

function firstNamedDate(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return parseNamedDate(match[1]);
}

function firstInteger(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function flip(cents: number | null): number | null {
  if (cents === null) return null;
  return cents === 0 ? 0 : -cents;
}

function isSkipLine(line: string): boolean {
  return (
    line === "" ||
    /^(Trans Date|Date Description Amount|Transactions|Fees|Interest Charged|Visit |Page \d|VentureOne|Visa |Pay or manage|Additional Information|PSGR:|ORIG:|TK#:|Total |Totals Year|Type of|Annual Percentage|LEE |Account |Payment |How |Billing |© |ETC-|MINIMUM PAYMENT|LATE PAYMENT|If you |And you |You will |Estimated savings|Welcome to|Track and |Rewards |Previous Balance Earned|Changing Mailing|When will|What To Do)/i.test(
      line,
    ) ||
    /days in Billing Cycle/i.test(line) ||
    /#\d{4}:/.test(line) ||
    /^[A-Z]{3}$/.test(line) ||
    /Exchange Rate/i.test(line)
  );
}

function parseRateTail(tail: string): {
  balanceSubjectCents: number | null;
  interestChargedCents: number | null;
} {
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

type Pending = {
  transMonth: number;
  transDay: number;
  postMonth: number | null;
  postDay: number | null;
  parts: string[];
};

function splitAmount(rest: string): { description: string; amountText: string | null } {
  const match = AMOUNT_TAIL.exec(rest.trim());
  if (!match) return { description: rest.trim(), amountText: null };
  return { description: match[1].trim(), amountText: match[2] };
}

function emitRow(
  pending: {
    transMonth: number;
    transDay: number;
    postMonth: number | null;
    postDay: number | null;
    description: string;
    amountText: string;
  },
  period: Period,
  errors: RowError[],
  lineNumber: number,
): ParsedTransaction | null {
  const transactionDate = resolveLedgerDate(
    pending.transMonth,
    pending.transDay,
    period,
  );
  if (!transactionDate) {
    errors.push({
      row: lineNumber,
      message: `Unreadable transaction date "${pending.transMonth}/${pending.transDay}".`,
    });
    return null;
  }
  let postedDate: string | null = null;
  if (pending.postMonth !== null && pending.postDay !== null) {
    postedDate = resolveLedgerDate(pending.postMonth, pending.postDay, period);
  }
  const statementCents = parseAmountCents(pending.amountText);
  if (statementCents === null) {
    errors.push({
      row: lineNumber,
      message: `Unreadable amount "${pending.amountText}".`,
    });
    return null;
  }
  const description = normalizeCapitalOneCardMerchant(pending.description);
  if (description === "") return null;
  return {
    transactionDate,
    postedDate,
    description,
    amountCents: flip(statementCents) ?? 0,
    sourceCategory: inferSourceCategory(description),
    memo: "",
    balanceAfterCents: null,
  };
}

function parseActivity(
  lines: readonly string[],
  period: Period,
  errors: RowError[],
): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let pending: Pending | null = null;

  const flush = (amountText: string, lineNumber: number) => {
    if (!pending) return;
    const row = emitRow(
      {
        transMonth: pending.transMonth,
        transDay: pending.transDay,
        postMonth: pending.postMonth,
        postDay: pending.postDay,
        description: pending.parts.join(" "),
        amountText,
      },
      period,
      errors,
      lineNumber,
    );
    if (row) transactions.push(row);
    pending = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSkipLine(line)) {
      continue;
    }
    if (LONE_AMOUNT.test(line)) {
      const next = lines[i + 1] ?? "";
      if (/^[A-Z]{3}$/.test(next) || /Exchange Rate/i.test(next)) continue;
      if (pending) {
        flush(line, i + 1);
        continue;
      }
      continue;
    }
    if (AUTH_DATE_ONLY.test(line)) continue;

    const two = TWO_DATE.exec(line);
    if (two) {
      if (pending) pending = null;
      const [, tMon, tDay, pMon, pDay, rest] = two;
      const { description, amountText } = splitAmount(rest);
      if (amountText) {
        const row = emitRow(
          {
            transMonth: MONTHS[tMon],
            transDay: Number(tDay),
            postMonth: MONTHS[pMon],
            postDay: Number(pDay),
            description,
            amountText,
          },
          period,
          errors,
          i + 1,
        );
        if (row) transactions.push(row);
      } else {
        pending = {
          transMonth: MONTHS[tMon],
          transDay: Number(tDay),
          postMonth: MONTHS[pMon],
          postDay: Number(pDay),
          parts: [description],
        };
      }
      continue;
    }

    const one = ONE_DATE.exec(line);
    if (one) {
      if (pending) pending = null;
      const [, mon, day, rest] = one;
      const { description, amountText } = splitAmount(rest);
      if (amountText) {
        const row = emitRow(
          {
            transMonth: MONTHS[mon],
            transDay: Number(day),
            postMonth: null,
            postDay: null,
            description,
            amountText,
          },
          period,
          errors,
          i + 1,
        );
        if (row) transactions.push(row);
      } else {
        pending = {
          transMonth: MONTHS[mon],
          transDay: Number(day),
          postMonth: null,
          postDay: null,
          parts: [description],
        };
      }
      continue;
    }

    if (pending) {
      pending.parts.push(line);
    }
  }

  return transactions;
}

function parseInterestRows(text: string, period: Period): ParsedTransaction[] {
  const rows: ParsedTransaction[] = [];
  const kinds: [RegExp, string][] = [
    [/Interest Charge on Purchases\s+(\$?[\d,]+\.\d{2})/i, "INTEREST CHARGE:PURCHASES"],
    [
      /Interest Charge on Cash Advances\s+(\$?[\d,]+\.\d{2})/i,
      "INTEREST CHARGE:CASH ADVANCES",
    ],
    [
      /Interest Charge on Other Balances\s+(\$?[\d,]+\.\d{2})/i,
      "INTEREST CHARGE:OTHER",
    ],
  ];
  for (const [pattern, description] of kinds) {
    const cents = firstAmount(text, pattern);
    if (cents === null || cents === 0) continue;
    rows.push({
      transactionDate: period.end,
      postedDate: period.end,
      description,
      amountCents: -cents,
      sourceCategory: "Fee/Interest Charge",
      memo: "",
      balanceAfterCents: null,
    });
  }
  return rows;
}

/**
 * Parse extracted text from one Capital One card monthly statement PDF.
 *
 * A file that is not this statement format fails outright. Individual unreadable
 * ledger rows become `errors` and are skipped.
 */
export function parseCapitalOneCardStatement(
  fileName: string,
  text: string,
): ParseSuccess | ParseFailure {
  if (!looksLikeCapitalOneCardStatement(text)) {
    return {
      ok: false,
      error: `"${fileName}" is not a recognised statement. ${SUPPORTED}`,
    };
  }

  const externalKey = capitalOneCardAccountKeyFromFileName(fileName);
  if (!externalKey) {
    return {
      ok: false,
      error: `"${fileName}" is a Capital One card statement, but the last four digits are only in the filename. Keep the bank's name (for example Statement_072026_3448.pdf) or include "Capital One" followed by the last four.`,
    };
  }

  const period = parsePeriod(text);
  if (!period) {
    return {
      ok: false,
      error: `"${fileName}" looks like a Capital One card statement but has no readable billing period.`,
    };
  }

  const errors: RowError[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const transactions = [
    ...parseActivity(lines, period, errors),
    ...parseInterestRows(text, period),
  ];

  const openingPrinted = firstAmount(text, /Previous Balance\s+(\$?[\d,]+\.\d{2})/);
  const closingPrinted = firstAmount(text, /New Balance(?:\s*=)?\s+(\$?[\d,]+\.\d{2})/);
  if (openingPrinted === null || closingPrinted === null) {
    return {
      ok: false,
      error: `"${fileName}" looks like a Capital One card statement but has no readable previous/new balance.`,
    };
  }

  const openingBalanceCents = flip(openingPrinted) ?? 0;
  const closingBalanceCents = flip(closingPrinted) ?? 0;
  const activity = transactions.reduce((sum, row) => sum + row.amountCents, 0);
  if (openingBalanceCents + activity !== closingBalanceCents) {
    errors.push({
      row: 0,
      message: `${fileName} Capital One •••${externalKey}: opening plus activity does not equal the statement closing balance.`,
    });
  }

  const account: ParsedAccount = {
    externalKey,
    name: `Capital One •••${externalKey}`,
    institution: "Capital One",
    kind: "credit_card",
    transactions,
  };

  const payments = firstAmount(text, /(?:^|\n)Payments\s+(-?\s*\$[\d,]+\.\d{2})/);
  const otherCredits = firstAmount(text, /Other Credits\s+(-?\s*\$[\d,]+\.\d{2})/);
  const paymentsCreditsCents =
    payments === null && otherCredits === null
      ? null
      : flip((payments ?? 0) + (otherCredits ?? 0));

  const statement: ParsedStatement = {
    externalKey,
    periodStart: period.start,
    periodEnd: period.end,
    statementDate: period.end,
    openingBalanceCents,
    closingBalanceCents,
    paymentDueDate: firstNamedDate(
      text,
      /Payment Due Date:?\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},\s+\d{4})/,
    ),
    minimumPaymentCents: firstAmount(
      text,
      /Minimum Payment Due:?\s*(\$?[\d,]+\.\d{2})/,
    ),
    pastDueAmountCents: null,
    creditLimitCents: firstAmount(text, /Credit Limit\s+(\$?[\d,]+\.\d{2})/),
    availableCreditCents: firstAmount(
      text,
      /Available Credit(?:\s+\(as of [^)]+\))?\s+(\$?[\d,]+\.\d{2})/,
    ),
    paymentsCreditsCents,
    purchasesCents: flip(
      firstAmount(text, /(?:^|\n)Transactions\s+\+?\s*(\$?[\d,]+\.\d{2})/),
    ),
    cashAdvancesCents: flip(
      firstAmount(text, /Cash Advances\s+\+?\s*(\$?[\d,]+\.\d{2})/),
    ),
    balanceTransfersCents: null,
    feesChargedCents: flip(
      firstAmount(text, /Fees Charged\s+\+?\s*(\$?[\d,]+\.\d{2})/),
    ),
    interestChargedCents: flip(
      firstAmount(text, /(?:^|\n)Interest Charged\s+\+?\s*(\$?[\d,]+\.\d{2})/),
    ),
    ytdFeesCents: firstAmount(text, /Total Fees charged\s+(\$?[\d,]+\.\d{2})/),
    ytdInterestCents: firstAmount(text, /Total Interest charged\s+(\$?[\d,]+\.\d{2})/),
    rewardsPoints: firstInteger(text, /Rewards Balance\s+([\d,]+)/),
    rates: parseRates(lines),
  };

  return {
    ok: true,
    parsed: {
      feed: "csv:capitalone-card",
      accounts: [account],
      statements: [statement],
      errors,
    },
  };
}
