import { parseAmountCents } from "./money";
import type { FinanceFeed } from "./types";

export const PLANNER_BANK_SNAPSHOT_HEADER = "# planner-bank-snapshot v1";
export const LEGACY_PLANNER_PENDING_HEADER = "# planner-pending v1";
export const CAPITAL_ONE_SCRAPE_FEED = "scrape:capitalone";
export const CHASE_SCRAPE_FEED = "scrape:chase";

export type BankSnapshotSource = "chase" | "capitalone";

export type BankBrowserSnapshotRowV1 = {
  /** Raw date from the bank table, not a Planner-normalized day. */
  transactionDate: string;
  /** Raw posted date; Chase repeats its Activity-table date here. */
  postedDate: string | null;
  description: string;
  category: string;
  /** Raw displayed card amount. Planner always negates it at parse time. */
  amount: string;
};

export type BankBrowserSnapshotV1 = {
  version: 1;
  source: BankSnapshotSource;
  /** ISO-8601 instant recorded by the browser when Copy was pressed. */
  capturedAt: string;
  accountLast4: string;
  balanceKind: "posted_only";
  /** Raw displayed card balance. */
  currentBalance: string;
  completeness: {
    currentCycle: true;
    posted: true;
    pending: true;
    filtered: false;
    searched: false;
  };
  posted: BankBrowserSnapshotRowV1[];
  pending: BankBrowserSnapshotRowV1[];
};

export type ParsedBankSnapshotRow = {
  transactionDate: string;
  postedDate: string | null;
  description: string;
  sourceCategory: string;
  /** Register convention: purchases negative, displayed negative payments positive. */
  amountCents: number;
  externalId: string;
  raw: BankBrowserSnapshotRowV1;
};

export type ParsedBankBrowserSnapshot = {
  source: BankSnapshotSource;
  feed: FinanceFeed;
  capturedAt: Date;
  accountLast4: string;
  currentBalanceCents: number;
  posted: ParsedBankSnapshotRow[];
  pending: ParsedBankSnapshotRow[];
  /** Preserved byte-for-byte in the audit evidence. */
  rawText: string;
};

export type ParseBankBrowserSnapshotResult =
  { ok: true; snapshot: ParsedBankBrowserSnapshot } | { ok: false; error: string };

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const TOP_LEVEL_KEYS = new Set([
  "version",
  "source",
  "capturedAt",
  "accountLast4",
  "balanceKind",
  "currentBalance",
  "completeness",
  "posted",
  "pending",
]);
const ROW_KEYS = new Set([
  "transactionDate",
  "postedDate",
  "description",
  "category",
  "amount",
]);
const COMPLETENESS_KEYS = new Set([
  "currentCycle",
  "posted",
  "pending",
  "filtered",
  "searched",
]);

export function isScrapeFeed(source: string): boolean {
  return source === CAPITAL_ONE_SCRAPE_FEED || source === CHASE_SCRAPE_FEED;
}

export function looksLikeBankBrowserSnapshot(text: string): boolean {
  return firstMeaningfulLine(text) === PLANNER_BANK_SNAPSHOT_HEADER;
}

export function looksLikeLegacyPlannerPending(text: string): boolean {
  return firstMeaningfulLine(text) === LEGACY_PLANNER_PENDING_HEADER;
}

/**
 * Parse bank calendar text by components. A bank date is a day label, never an instant;
 * `new Date(raw)` would let the process timezone change it.
 */
export function parseBankDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return isRealDate(year, month, day) ? trimmed : null;
  }

  const weekday = /^[A-Za-z]{3}, ([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(trimmed);
  if (weekday) return fromMonthDayYear(weekday[1], weekday[2], weekday[3]);

  const monthDay = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(trimmed);
  if (monthDay) return fromMonthDayYear(monthDay[1], monthDay[2], monthDay[3]);

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!slash) return null;
  const month = Number(slash[1]);
  const day = Number(slash[2]);
  const year = Number(slash[3]);
  return isRealDate(year, month, day)
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function fromMonthDayYear(
  monthRaw: string,
  dayRaw: string,
  yearRaw: string,
): string | null {
  const month = MONTHS[monthRaw.toLowerCase()];
  if (!month) return null;
  const year = Number(yearRaw);
  const day = Number(dayRaw);
  if (!isRealDate(year, Number(month), day)) return null;
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function snapshotBody(text: string): string {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex(
    (line) => line.trim() === PLANNER_BANK_SNAPSHOT_HEADER,
  );
  return lines
    .slice(headerAt + 1)
    .join("\n")
    .trim();
}

function sourceFeed(source: BankSnapshotSource): FinanceFeed {
  return source === "chase" ? CHASE_SCRAPE_FEED : CAPITAL_ONE_SCRAPE_FEED;
}

function parseRows(
  rawRows: unknown,
  source: BankSnapshotSource,
  accountLast4: string,
  pending: boolean,
): { ok: true; rows: ParsedBankSnapshotRow[] } | { ok: false; error: string } {
  if (!Array.isArray(rawRows)) {
    return {
      ok: false,
      error: `The ${pending ? "pending" : "posted"} section is missing.`,
    };
  }

  const provisional: Omit<ParsedBankSnapshotRow, "externalId">[] = [];
  for (let index = 0; index < rawRows.length; index++) {
    const value = rawRows[index];
    if (!isObject(value) || !hasOnlyKeys(value, ROW_KEYS)) {
      return {
        ok: false,
        error: `The ${pending ? "pending" : "posted"} row ${index + 1} contains unsupported page data.`,
      };
    }
    const transactionDateRaw = value.transactionDate;
    const postedDateRaw = value.postedDate;
    const description = value.description;
    const category = value.category;
    const amountRaw = value.amount;
    if (
      typeof transactionDateRaw !== "string" ||
      (postedDateRaw !== null && typeof postedDateRaw !== "string") ||
      typeof description !== "string" ||
      typeof category !== "string" ||
      typeof amountRaw !== "string"
    ) {
      return {
        ok: false,
        error: `The ${pending ? "pending" : "posted"} row ${index + 1} has the wrong shape.`,
      };
    }
    const cleanDescription = description.replace(/\s+/g, " ").trim();
    if (cleanDescription === "") {
      return {
        ok: false,
        error: `The ${pending ? "pending" : "posted"} row ${index + 1} is missing its description.`,
      };
    }
    const transactionDate = parseBankDate(transactionDateRaw);
    if (transactionDate === null) {
      return {
        ok: false,
        error: `Could not read the date for ${cleanDescription}.`,
      };
    }
    const postedDate = postedDateRaw === null ? null : parseBankDate(postedDateRaw);
    if (
      (!pending && postedDate === null) ||
      (postedDateRaw !== null && postedDate === null)
    ) {
      return {
        ok: false,
        error: `Could not read the posted date for ${cleanDescription}.`,
      };
    }
    const displayedCents = parseAmountCents(amountRaw);
    if (displayedCents === null || displayedCents === 0) {
      return {
        ok: false,
        error: `Could not read the amount for ${cleanDescription}.`,
      };
    }
    provisional.push({
      transactionDate,
      postedDate,
      description: cleanDescription,
      sourceCategory: category.trim(),
      // Card pages display purchases as positive and payments/refunds as negative.
      amountCents: -displayedCents,
      raw: {
        transactionDate: transactionDateRaw,
        postedDate: postedDateRaw,
        description,
        category,
        amount: amountRaw,
      },
    });
  }

  const seen = new Map<string, number>();
  return {
    ok: true,
    rows: provisional.map((row) => {
      const stem = [
        source,
        accountLast4,
        pending ? "pending" : "posted",
        row.transactionDate,
        row.postedDate ?? "",
        fold(row.description),
        row.amountCents,
      ].join("|");
      const occurrence = seen.get(stem) ?? 0;
      seen.set(stem, occurrence + 1);
      return { ...row, externalId: `${stem}|${occurrence}` };
    }),
  };
}

/** Parse and validate one complete, fail-closed bank-page clipboard snapshot. */
export function parseBankBrowserSnapshot(text: string): ParseBankBrowserSnapshotResult {
  if (looksLikeLegacyPlannerPending(text)) {
    return {
      ok: false,
      error:
        "That paste came from the old pending-only userscript. Update the Chase and Capital One userscripts, copy a complete bank snapshot, and paste again.",
    };
  }
  if (!looksLikeBankBrowserSnapshot(text)) {
    return { ok: false, error: "That is not a Planner bank snapshot." };
  }

  let unknown: unknown;
  try {
    unknown = JSON.parse(snapshotBody(text));
  } catch {
    return { ok: false, error: "The bank snapshot JSON could not be read." };
  }
  if (!isObject(unknown) || !hasOnlyKeys(unknown, TOP_LEVEL_KEYS)) {
    return {
      ok: false,
      error: "The bank snapshot contains unsupported or unrelated page data.",
    };
  }
  if (unknown.version !== 1) {
    return { ok: false, error: "That bank snapshot version is not supported." };
  }
  if (unknown.source !== "chase" && unknown.source !== "capitalone") {
    return {
      ok: false,
      error: "The bank snapshot source must be Chase or Capital One.",
    };
  }
  const source = unknown.source;
  if (
    typeof unknown.accountLast4 !== "string" ||
    !/^\d{4}$/.test(unknown.accountLast4)
  ) {
    return {
      ok: false,
      error: "The bank snapshot needs exactly the account last four.",
    };
  }
  if (unknown.balanceKind !== "posted_only") {
    return {
      ok: false,
      error: "The bank snapshot must identify Current balance as posted-only.",
    };
  }
  if (typeof unknown.capturedAt !== "string" || !/T/.test(unknown.capturedAt)) {
    return { ok: false, error: "The bank snapshot needs a capture instant." };
  }
  const capturedAtMs = Date.parse(unknown.capturedAt);
  if (!Number.isFinite(capturedAtMs)) {
    return { ok: false, error: "The bank snapshot capture instant is invalid." };
  }
  const complete = unknown.completeness;
  if (!isObject(complete) || !hasOnlyKeys(complete, COMPLETENESS_KEYS)) {
    return { ok: false, error: "The bank snapshot has invalid completeness markers." };
  }
  if (complete.filtered !== false || complete.searched !== false) {
    return {
      ok: false,
      error: "Clear the bank page's filters and search before copying a snapshot.",
    };
  }
  if (
    complete.currentCycle !== true ||
    complete.posted !== true ||
    complete.pending !== true
  ) {
    return {
      ok: false,
      error:
        "The bank page did not expose a complete current-cycle posted and pending snapshot.",
    };
  }
  if (typeof unknown.currentBalance !== "string") {
    return { ok: false, error: "The bank snapshot has no current balance." };
  }
  const displayedBalanceCents = parseAmountCents(unknown.currentBalance);
  if (displayedBalanceCents === null) {
    return { ok: false, error: "Could not read the current balance." };
  }

  const posted = parseRows(unknown.posted, source, unknown.accountLast4, false);
  if (!posted.ok) return posted;
  const pending = parseRows(unknown.pending, source, unknown.accountLast4, true);
  if (!pending.ok) return pending;

  return {
    ok: true,
    snapshot: {
      source,
      feed: sourceFeed(source),
      capturedAt: new Date(capturedAtMs),
      accountLast4: unknown.accountLast4,
      currentBalanceCents: -displayedBalanceCents,
      posted: posted.rows,
      pending: pending.rows,
      rawText: text,
    },
  };
}

function fold(description: string): string {
  return description.replace(/\s+/g, " ").trim().toUpperCase();
}

function firstMeaningfulLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}
