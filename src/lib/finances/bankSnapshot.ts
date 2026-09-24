import { parseAmountCents } from "./money";
import { dateKeyFromParts, isRealCalendarDate } from "@/lib/schedule/geometry";
import type { FinanceFeed } from "./types";

export const PLANNER_BANK_SNAPSHOT_HEADER = "# planner-bank-snapshot v1";
export const LEGACY_PLANNER_PENDING_HEADER = "# planner-pending v1";
export const CAPITAL_ONE_SCRAPE_FEED = "scrape:capitalone";
export const CHASE_SCRAPE_FEED = "scrape:chase";
/** Every bank-page scrape source — what `isScrapeFeed` accepts, as a list SQL can use. */
export const SCRAPE_FEEDS = [CAPITAL_ONE_SCRAPE_FEED, CHASE_SCRAPE_FEED] as const;

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
  /**
   * Optional: the row's "Appears on statement as" text, the wording a CSV or PDF uses. A
   * pending row may not have one yet.
   */
  statementDescriptor?: string;
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
    recentPosted?: true;
  };
  posted: BankBrowserSnapshotRowV1[];
  pending: BankBrowserSnapshotRowV1[];
  /**
   * Optional: the most recently closed statement's rows. Evidence for where a hold went —
   * never inserted, never counted as posted history. Sent with `recentStatementClosedOn`.
   */
  recentStatementClosedOn?: string;
  recentPosted?: BankBrowserSnapshotRowV1[];
};

export type ParsedBankSnapshotRow = {
  transactionDate: string;
  postedDate: string | null;
  /**
   * The page's display name ("Kim's Nails III"). Identity and page-to-page matching use it;
   * the stored `description` is the statement descriptor when there is one (D4).
   */
  description: string;
  /** "Appears on statement as", or null when the page did not show one. */
  statementDescriptor: string | null;
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
  /** Closed-statement rows, successor evidence only. Empty when the capture carried none. */
  recentPosted: ParsedBankSnapshotRow[];
  /** Calendar day the `recentPosted` statement closed; null when none was sent. */
  recentStatementClosedOn: string | null;
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
  "recentPosted",
  "recentStatementClosedOn",
]);
const ROW_KEYS = new Set([
  "transactionDate",
  "postedDate",
  "description",
  "category",
  "amount",
  "statementDescriptor",
]);
const COMPLETENESS_KEYS = new Set([
  "currentCycle",
  "posted",
  "pending",
  "filtered",
  "searched",
  "recentPosted",
]);

export function isScrapeFeed(source: string): boolean {
  return (SCRAPE_FEEDS as readonly string[]).includes(source);
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
    return isRealCalendarDate(year, month, day) ? trimmed : null;
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
  return dateKeyFromParts(year, month, day);
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
  return dateKeyFromParts(year, Number(month), day);
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
  kind: "posted" | "pending" | "recent",
): { ok: true; rows: ParsedBankSnapshotRow[] } | { ok: false; error: string } {
  const pending = kind === "pending";
  const label = kind === "recent" ? "closed statement" : kind;
  if (!Array.isArray(rawRows)) {
    return {
      ok: false,
      error: `The ${label} section is missing.`,
    };
  }

  const provisional: Omit<ParsedBankSnapshotRow, "externalId">[] = [];
  for (let index = 0; index < rawRows.length; index++) {
    const value = rawRows[index];
    if (!isObject(value) || !hasOnlyKeys(value, ROW_KEYS)) {
      return {
        ok: false,
        error: `The ${label} row ${index + 1} contains unsupported page data.`,
      };
    }
    const transactionDateRaw = value.transactionDate;
    const postedDateRaw = value.postedDate;
    const description = value.description;
    const category = value.category;
    const amountRaw = value.amount;
    const descriptorRaw = value.statementDescriptor;
    if (
      (descriptorRaw !== undefined && typeof descriptorRaw !== "string") ||
      typeof transactionDateRaw !== "string" ||
      (postedDateRaw !== null && typeof postedDateRaw !== "string") ||
      typeof description !== "string" ||
      typeof category !== "string" ||
      typeof amountRaw !== "string"
    ) {
      return {
        ok: false,
        error: `The ${label} row ${index + 1} has the wrong shape.`,
      };
    }
    const cleanDescription = description.replace(/\s+/g, " ").trim();
    if (cleanDescription === "") {
      return {
        ok: false,
        error: `The ${label} row ${index + 1} is missing its description.`,
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
    const cleanDescriptor = (descriptorRaw ?? "").replace(/\s+/g, " ").trim();
    provisional.push({
      transactionDate,
      postedDate,
      description: cleanDescription,
      statementDescriptor: cleanDescriptor === "" ? null : cleanDescriptor,
      sourceCategory: category.trim(),
      // Card pages display purchases as positive and payments/refunds as negative.
      amountCents: -displayedCents,
      raw: {
        transactionDate: transactionDateRaw,
        postedDate: postedDateRaw,
        description,
        category,
        amount: amountRaw,
        ...(descriptorRaw === undefined ? {} : { statementDescriptor: descriptorRaw }),
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
        kind,
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

  const posted = parseRows(unknown.posted, source, unknown.accountLast4, "posted");
  if (!posted.ok) return posted;
  const pending = parseRows(unknown.pending, source, unknown.accountLast4, "pending");
  if (!pending.ok) return pending;

  let recentPosted: ParsedBankSnapshotRow[] = [];
  let recentStatementClosedOn: string | null = null;
  const hasRecent =
    unknown.recentPosted !== undefined || unknown.recentStatementClosedOn !== undefined;
  if (hasRecent) {
    if (typeof unknown.recentStatementClosedOn !== "string") {
      return { ok: false, error: "The closed statement has no close date." };
    }
    recentStatementClosedOn = parseBankDate(unknown.recentStatementClosedOn);
    if (recentStatementClosedOn === null) {
      return { ok: false, error: "Could not read the closed statement's date." };
    }
    if (complete.recentPosted !== true) {
      return {
        ok: false,
        error: "The bank page did not expose a complete closed statement.",
      };
    }
    const recent = parseRows(
      unknown.recentPosted,
      source,
      unknown.accountLast4,
      "recent",
    );
    if (!recent.ok) return recent;
    recentPosted = recent.rows;
  } else if (complete.recentPosted !== undefined) {
    return { ok: false, error: "The bank snapshot has invalid completeness markers." };
  }

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
      recentPosted,
      recentStatementClosedOn,
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
